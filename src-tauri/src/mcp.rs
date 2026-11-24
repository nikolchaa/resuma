//! Local MCP endpoint: lets other AI apps (MCP clients) work with Resuma.
//!
//! This side only handles the network: it listens on 127.0.0.1, checks the
//! bearer token and the Host/Origin headers, limits request sizes, and keeps
//! track of sessions. Every JSON-RPC message is passed to the window
//! (`mcp://message`), where the MCP server and its tools run (src/lib/mcp),
//! and the window's reply comes back through `mcp_reply`.
//!
//! Streamable HTTP, answered with plain JSON: POST carries one message, a
//! request gets its response in the HTTP response, notifications get 202.
//! There is no event stream (GET answers 405).

use serde::Serialize;
use serde_json::{json, Value};
use std::collections::{HashMap, HashSet};
use std::io::Read;
use std::sync::mpsc::{channel, Sender};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::{AppHandle, Emitter};
use tiny_http::{Header, Request, Response, Server};

use crate::secrets;

/// Largest request body accepted (a 256 KB template plus JSON overhead).
const MAX_BODY: usize = 1024 * 1024;
/// How long a request waits for the window (a render check can take a while).
const REPLY_TIMEOUT: Duration = Duration::from_secs(120);
/// Where the token is kept, next to the API keys.
const TOKEN_KEY: &str = "mcp-token";

/// A message for the window. `key` is set when a reply is expected.
#[derive(Clone, Serialize)]
pub struct Forward {
    pub session: String,
    pub key: Option<String>,
    pub message: Value,
}

/// What the window answered for one request.
pub enum Reply {
    Message(Value),
    UnknownSession,
}

type Forwarder = Arc<dyn Fn(Forward) + Send + Sync>;
/// Where the current token comes from (the credential store; a constant in tests).
type TokenSource = Arc<dyn Fn() -> Result<String, String> + Send + Sync>;

struct Running {
    server: Arc<Server>,
    port: u16,
}

#[derive(Default)]
struct State {
    running: Option<Running>,
    sessions: HashSet<String>,
    pending: HashMap<String, Sender<Reply>>,
}

lazy_static::lazy_static! {
    static ref STATE: Mutex<State> = Mutex::new(State::default());
}

#[derive(Serialize)]
pub struct McpStatus {
    running: bool,
    port: Option<u16>,
    sessions: usize,
}

fn status() -> McpStatus {
    let state = STATE.lock().unwrap();
    McpStatus {
        running: state.running.is_some(),
        port: state.running.as_ref().map(|r| r.port),
        sessions: state.sessions.len(),
    }
}

// ---- token ------------------------------------------------------------------

fn new_token() -> String {
    format!("{}{}", uuid::Uuid::new_v4().simple(), uuid::Uuid::new_v4().simple())
}

fn current_token() -> Result<String, String> {
    match secrets::get_api_key(TOKEN_KEY)? {
        Some(token) => Ok(token),
        None => {
            let token = new_token();
            secrets::store_secret(TOKEN_KEY, &token)?;
            Ok(token)
        }
    }
}

/// Compares in constant time, so the token can't be guessed byte by byte.
fn same_secret(a: &str, b: &str) -> bool {
    let (a, b) = (a.as_bytes(), b.as_bytes());
    if a.len() != b.len() {
        return false;
    }
    a.iter().zip(b).fold(0u8, |acc, (x, y)| acc | (x ^ y)) == 0
}

// ---- request checks -----------------------------------------------------------

fn header<'a>(request: &'a Request, name: &str) -> Option<&'a str> {
    request
        .headers()
        .iter()
        .find(|h| h.field.as_str().as_str().eq_ignore_ascii_case(name))
        .map(|h| h.value.as_str())
}

/// Checks a request's headers; the error is the HTTP status to answer with.
///
/// - Host must name this machine (blocks DNS rebinding from web pages).
/// - Origin, sent by browsers, must be this endpoint itself (blocks other
///   web pages; MCP clients don't send one).
/// - The bearer token must match.
fn check_headers(host: Option<&str>, origin: Option<&str>, auth: Option<&str>, port: u16, token: &str) -> Result<(), u16> {
    let allowed_hosts = [format!("127.0.0.1:{port}"), format!("localhost:{port}")];
    match host {
        Some(h) if allowed_hosts.iter().any(|a| a.eq_ignore_ascii_case(h.trim())) => {}
        _ => return Err(403),
    }
    if let Some(origin) = origin {
        let ok = allowed_hosts
            .iter()
            .any(|a| origin.trim().eq_ignore_ascii_case(&format!("http://{a}")));
        if !ok {
            return Err(403);
        }
    }
    match auth.and_then(|a| a.trim().strip_prefix("Bearer ")) {
        Some(given) if same_secret(given.trim(), token) => Ok(()),
        _ => Err(401),
    }
}

/// A JSON-RPC request (it has an id and a method) expects a response.
fn is_request(message: &Value) -> bool {
    message.get("method").is_some() && message.get("id").map_or(false, |id| !id.is_null())
}

fn json_response(status: u16, body: &Value, session: Option<&str>) -> Response<std::io::Cursor<Vec<u8>>> {
    let mut response = Response::from_data(serde_json::to_vec(body).unwrap_or_default()).with_status_code(status);
    response.add_header(Header::from_bytes("Content-Type", "application/json").unwrap());
    if let Some(session) = session {
        response.add_header(Header::from_bytes("Mcp-Session-Id", session).unwrap());
    }
    response
}

fn empty(status: u16) -> Response<std::io::Empty> {
    Response::empty(status)
}

fn rpc_error(id: &Value, code: i64, message: &str) -> Value {
    json!({ "jsonrpc": "2.0", "id": id, "error": { "code": code, "message": message } })
}

// ---- handling -------------------------------------------------------------------

fn handle(mut request: Request, port: u16, token: &str, forward: &Forwarder) {
    let result = (|| -> Result<(), std::io::Error> {
        if request.url().split('?').next() != Some("/mcp") {
            return request.respond(empty(404));
        }
        if let Err(status) = check_headers(
            header(&request, "Host"),
            header(&request, "Origin"),
            header(&request, "Authorization"),
            port,
            token,
        ) {
            return request.respond(empty(status));
        }

        let session = header(&request, "Mcp-Session-Id").map(str::to_string);
        match request.method().as_str() {
            "POST" => {}
            "DELETE" => {
                if let Some(session) = session {
                    STATE.lock().unwrap().sessions.remove(&session);
                    forward(Forward { session, key: None, message: json!({ "jsonrpc": "2.0", "method": "$/end" }) });
                }
                return request.respond(empty(200));
            }
            // No server-started stream; clients carry on without one.
            _ => return request.respond(empty(405)),
        }

        if request.body_length().map_or(false, |n| n > MAX_BODY) {
            return request.respond(empty(413));
        }
        let mut body = Vec::new();
        request.as_reader().take(MAX_BODY as u64 + 1).read_to_end(&mut body)?;
        if body.len() > MAX_BODY {
            return request.respond(empty(413));
        }
        let message: Value = match serde_json::from_slice::<Value>(&body) {
            Ok(v) if v.is_object() => v,
            _ => return request.respond(json_response(400, &rpc_error(&Value::Null, -32700, "Expected one JSON-RPC message"), None)),
        };

        let initialize = message.get("method").and_then(Value::as_str) == Some("initialize");
        let session = if initialize {
            let id = uuid::Uuid::new_v4().to_string();
            STATE.lock().unwrap().sessions.insert(id.clone());
            id
        } else {
            match session {
                Some(s) if STATE.lock().unwrap().sessions.contains(&s) => s,
                Some(_) => return request.respond(empty(404)),
                None => return request.respond(empty(400)),
            }
        };

        if !is_request(&message) {
            forward(Forward { session, key: None, message });
            return request.respond(empty(202));
        }

        let id = message.get("id").cloned().unwrap_or(Value::Null);
        let key = uuid::Uuid::new_v4().to_string();
        let (tx, rx) = channel();
        STATE.lock().unwrap().pending.insert(key.clone(), tx);
        forward(Forward { session: session.clone(), key: Some(key.clone()), message });

        let reply = rx.recv_timeout(REPLY_TIMEOUT);
        STATE.lock().unwrap().pending.remove(&key);
        match reply {
            Ok(Reply::Message(answer)) => request.respond(json_response(200, &answer, initialize.then_some(session.as_str()))),
            Ok(Reply::UnknownSession) => {
                STATE.lock().unwrap().sessions.remove(&session);
                request.respond(empty(404))
            }
            Err(_) => request.respond(json_response(
                200,
                &rpc_error(&id, -32603, "Resuma didn't answer in time. Is its window open?"),
                None,
            )),
        }
    })();
    if let Err(e) = result {
        eprintln!("[mcp] request failed: {e}");
    }
}

/// Starts listening on 127.0.0.1:`port` (0 picks a free port) and returns the
/// port. Calling it again while running on the same port only forgets the
/// sessions (the window was reloaded and lost them).
fn start(port: u16, forward: Forwarder, token: TokenSource) -> Result<u16, String> {
    let mut state = STATE.lock().unwrap();
    if let Some(running) = &state.running {
        if running.port == port {
            state.sessions.clear();
            return Ok(port);
        }
        running.server.unblock();
        state.running = None;
    }
    token()?; // fail early when the credential store can't be reached
    let server = Server::http(("127.0.0.1", port))
        .map_err(|e| format!("Couldn't listen on port {port} (is it used by another app, or another Resuma?): {e}"))?;
    let port = server.server_addr().to_ip().map(|a| a.port()).unwrap_or(port);
    let server = Arc::new(server);
    state.running = Some(Running { server: server.clone(), port });
    state.sessions.clear();
    drop(state);

    std::thread::spawn(move || {
        for request in server.incoming_requests() {
            let forward = forward.clone();
            // Read per request, so a regenerated token applies at once.
            match token() {
                Ok(token) => {
                    std::thread::spawn(move || handle(request, port, &token, &forward));
                }
                Err(e) => {
                    eprintln!("[mcp] no token: {e}");
                    let _ = request.respond(empty(503));
                }
            }
        }
    });
    Ok(port)
}

fn stop() {
    let mut state = STATE.lock().unwrap();
    if let Some(running) = state.running.take() {
        running.server.unblock();
    }
    state.sessions.clear();
    for (_, tx) in state.pending.drain() {
        let _ = tx.send(Reply::UnknownSession);
    }
}

fn deliver_reply(key: &str, reply: Reply) {
    if let Some(tx) = STATE.lock().unwrap().pending.remove(key) {
        let _ = tx.send(reply);
    }
}

// ---- commands -------------------------------------------------------------------

#[tauri::command]
pub async fn mcp_start(app: AppHandle, port: u16) -> Result<McpStatus, String> {
    let forward: Forwarder = Arc::new(move |f: Forward| {
        let _ = app.emit("mcp://message", f);
    });
    start(port, forward, Arc::new(current_token))?;
    Ok(status())
}

#[tauri::command]
pub async fn mcp_stop() -> Result<McpStatus, String> {
    stop();
    Ok(status())
}

#[tauri::command]
pub async fn mcp_status() -> Result<McpStatus, String> {
    Ok(status())
}

#[tauri::command]
pub async fn mcp_token() -> Result<String, String> {
    current_token()
}

/// A new token; clients using the old one are refused from the next request.
#[tauri::command]
pub async fn mcp_regenerate_token() -> Result<String, String> {
    let token = new_token();
    secrets::store_secret(TOKEN_KEY, &token)?;
    STATE.lock().unwrap().sessions.clear();
    Ok(token)
}

#[tauri::command]
pub async fn mcp_reply(key: String, message: Option<Value>, unknown_session: bool) -> Result<(), String> {
    let reply = match (unknown_session, message) {
        (false, Some(m)) => Reply::Message(m),
        _ => Reply::UnknownSession,
    };
    deliver_reply(&key, reply);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn compares_secrets_exactly() {
        assert!(same_secret("abc", "abc"));
        assert!(!same_secret("abc", "abd"));
        assert!(!same_secret("abc", "abcd"));
        assert!(!same_secret("", "a"));
    }

    #[test]
    fn checks_host_origin_and_token() {
        let ok = |h, o, a| check_headers(h, o, a, 4000, "secret");
        assert_eq!(ok(Some("127.0.0.1:4000"), None, Some("Bearer secret")), Ok(()));
        assert_eq!(ok(Some("localhost:4000"), Some("http://localhost:4000"), Some("Bearer secret")), Ok(()));
        // DNS rebinding: a web page reaching the port under another name
        assert_eq!(ok(Some("evil.example:4000"), None, Some("Bearer secret")), Err(403));
        assert_eq!(ok(None, None, Some("Bearer secret")), Err(403));
        // Another web page calling in
        assert_eq!(ok(Some("127.0.0.1:4000"), Some("https://evil.example"), Some("Bearer secret")), Err(403));
        assert_eq!(ok(Some("127.0.0.1:4000"), Some("null"), Some("Bearer secret")), Err(403));
        // Token
        assert_eq!(ok(Some("127.0.0.1:4000"), None, Some("Bearer wrong")), Err(401));
        assert_eq!(ok(Some("127.0.0.1:4000"), None, Some("secret")), Err(401));
        assert_eq!(ok(Some("127.0.0.1:4000"), None, None), Err(401));
    }

    /// Sends one raw HTTP request; returns the status code, headers and body.
    fn http(port: u16, method: &str, headers: &[(&str, &str)], body: &str) -> (u16, String, String) {
        use std::io::Write;
        use std::net::TcpStream;
        let mut stream = TcpStream::connect(("127.0.0.1", port)).unwrap();
        let mut raw = format!("{method} /mcp HTTP/1.1\r\nConnection: close\r\nContent-Length: {}\r\n", body.len());
        for (k, v) in headers {
            raw.push_str(&format!("{k}: {v}\r\n"));
        }
        raw.push_str("\r\n");
        raw.push_str(body);
        stream.write_all(raw.as_bytes()).unwrap();
        let mut out = String::new();
        stream.read_to_string(&mut out).unwrap();
        let (head, body) = out.split_once("\r\n\r\n").unwrap_or((&out, ""));
        let status = head.split_whitespace().nth(1).unwrap().parse().unwrap();
        (status, head.to_string(), body.to_string())
    }

    /// The whole HTTP path against a stand-in window that answers every
    /// request, with a fixed token so the real credential store is untouched.
    #[test]
    fn serves_sessions_over_http() {
        let forward: Forwarder = Arc::new(|f: Forward| {
            if let Some(key) = f.key {
                let id = f.message["id"].clone();
                let reply = if f.message["method"] == "boom" {
                    Reply::UnknownSession
                } else {
                    Reply::Message(json!({ "jsonrpc": "2.0", "id": id, "result": { "echo": f.message["method"], "session": f.session } }))
                };
                std::thread::spawn(move || deliver_reply(&key, reply));
            }
        });
        let port = start(0, forward, Arc::new(|| Ok("tok".to_string()))).unwrap();
        let host = format!("127.0.0.1:{port}");
        let ok = [("Host", host.as_str()), ("Authorization", "Bearer tok"), ("Content-Type", "application/json")];

        // initialize creates a session and returns its id
        let (status, head, body) = http(port, "POST", &ok, r#"{"jsonrpc":"2.0","id":1,"method":"initialize"}"#);
        assert_eq!(status, 200, "{head}");
        let session = head
            .lines()
            .find_map(|l| l.strip_prefix("Mcp-Session-Id: ").or_else(|| l.strip_prefix("mcp-session-id: ")))
            .unwrap()
            .trim()
            .to_string();
        assert!(body.contains(r#""echo":"initialize""#));

        let with_session = [ok[0], ok[1], ok[2], ("Mcp-Session-Id", session.as_str())];
        let (status, _, body) = http(port, "POST", &with_session, r#"{"jsonrpc":"2.0","id":2,"method":"tools/list"}"#);
        assert_eq!(status, 200);
        assert!(body.contains(&session));
        // notifications are accepted without a reply
        let (status, _, _) = http(port, "POST", &with_session, r#"{"jsonrpc":"2.0","method":"notifications/initialized"}"#);
        assert_eq!(status, 202);
        // no event stream
        assert_eq!(http(port, "GET", &with_session, "").0, 405);

        // refused: wrong token, foreign Host, foreign Origin, unknown or missing session, too big, not JSON
        assert_eq!(http(port, "POST", &[ok[0], ("Authorization", "Bearer nope")], "{}").0, 401);
        assert_eq!(http(port, "POST", &[("Host", "evil.example"), ok[1]], "{}").0, 403);
        assert_eq!(http(port, "POST", &[ok[0], ok[1], ("Origin", "https://evil.example")], "{}").0, 403);
        let unknown = [ok[0], ok[1], ("Mcp-Session-Id", "nope")];
        assert_eq!(http(port, "POST", &unknown, r#"{"jsonrpc":"2.0","id":3,"method":"ping"}"#).0, 404);
        assert_eq!(http(port, "POST", &ok, r#"{"jsonrpc":"2.0","id":3,"method":"ping"}"#).0, 400);
        assert_eq!(http(port, "POST", &ok, &"x".repeat(MAX_BODY + 10)).0, 413);
        assert_eq!(http(port, "POST", &ok, "not json").0, 400);

        // the window doesn't know the session (it was reloaded): 404, and the session is gone
        let (status, _, _) = http(port, "POST", &with_session, r#"{"jsonrpc":"2.0","id":4,"method":"boom"}"#);
        assert_eq!(status, 404);
        assert_eq!(http(port, "POST", &with_session, r#"{"jsonrpc":"2.0","id":5,"method":"ping"}"#).0, 404);

        stop();
        assert!(!super::status().running);
    }

    #[test]
    fn tells_requests_from_notifications_and_responses() {
        assert!(is_request(&json!({"jsonrpc": "2.0", "id": 1, "method": "tools/list"})));
        assert!(is_request(&json!({"jsonrpc": "2.0", "id": "a", "method": "ping"})));
        assert!(!is_request(&json!({"jsonrpc": "2.0", "method": "notifications/initialized"})));
        assert!(!is_request(&json!({"jsonrpc": "2.0", "id": 1, "result": {}})));
    }
}
