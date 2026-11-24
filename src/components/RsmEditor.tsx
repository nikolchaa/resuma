/**
 * Code editor for Resuma Markup (.rsm): CodeMirror 6 with a small syntax
 * highlighter and diagnostics (line/column) shown inline and in the gutter.
 */
import { useEffect, useRef } from "react";
import { basicSetup } from "codemirror";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { StreamLanguage } from "@codemirror/language";
import { lintGutter, setDiagnostics } from "@codemirror/lint";
import type { Diagnostic } from "@/renderer/rsm/parse";

/** Tokenizer: % comment lines, \commands, [options], {braces}, "strings", @options, #colours. */
const rsmLanguage = StreamLanguage.define<{ inOptions: boolean }>({
  name: "rsm",
  startState: () => ({ inOptions: false }),
  token(stream, state) {
    if (stream.sol() && stream.match(/^\s*%.*/)) return "comment";
    if (stream.match(/^\\[\\{}%[\]]/)) return "escape";
    if (stream.match(/^\\[A-Za-z][A-Za-z0-9-]*/)) {
      if (stream.peek() === "[") state.inOptions = true;
      return "keyword";
    }
    if (state.inOptions) {
      if (stream.eat("[")) return "bracket";
      if (stream.eat("]")) {
        state.inOptions = false;
        return "bracket";
      }
      if (stream.match(/^"(?:[^"\\]|\\.)*"?/)) return "string";
      if (stream.match(/^[A-Za-z_.*@-][\w.:*@-]*(?==)/)) return "attributeName";
      if (stream.match(/^[^,\]"=\s]+/)) return "attributeValue";
      stream.next();
      return null;
    }
    if (stream.eat("{") || stream.eat("}")) return "brace";
    if (stream.match(/^@[A-Za-z][A-Za-z0-9-]*/)) return "variableName";
    if (stream.match(/^#[0-9a-fA-F]{3,6}\b/)) return "number";
    stream.next();
    return null;
  },
});

const theme = EditorView.theme({
  "&": {
    height: "100%",
    fontSize: "12.5px",
    backgroundColor: "var(--background)",
    color: "var(--foreground)",
  },
  ".cm-scroller": { fontFamily: "ui-monospace, SFMono-Regular, Consolas, monospace", lineHeight: "1.55" },
  ".cm-gutters": {
    backgroundColor: "var(--muted)",
    color: "var(--muted-foreground)",
    borderRight: "1px solid var(--border)",
  },
  ".cm-activeLine, .cm-activeLineGutter": { backgroundColor: "color-mix(in oklab, var(--primary) 8%, transparent)" },
  "&.cm-focused": { outline: "none" },
  ".cm-cursor": { borderLeftColor: "var(--foreground)" },
  ".cm-tooltip": { backgroundColor: "var(--background)", border: "1px solid var(--border)" },
});

/** Line/column → document offset (both 1-based), clamped to the document. */
function offsetOf(state: EditorState, line: number, col: number): number {
  const l = state.doc.line(Math.min(Math.max(1, line), state.doc.lines));
  return Math.min(l.from + Math.max(0, col - 1), l.to);
}

type Props = {
  value: string;
  onChange: (value: string) => void;
  diagnostics: Diagnostic[];
  ariaLabel: string;
  className?: string;
};

export const RsmEditor = ({ value, onChange, diagnostics, ariaLabel, className }: Props) => {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    const v = new EditorView({
      parent: host.current!,
      state: EditorState.create({
        doc: value,
        extensions: [
          basicSetup,
          rsmLanguage,
          lintGutter(),
          theme,
          EditorView.lineWrapping,
          EditorView.contentAttributes.of({ "aria-label": ariaLabel }),
          EditorView.updateListener.of((u) => {
            if (u.docChanged) onChangeRef.current(u.state.doc.toString());
          }),
        ],
      }),
    });
    view.current = v;
    return () => {
      v.destroy();
      view.current = null;
    };
    // The editor is created once; value/diagnostics are synced below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // External value changes (undo, forms, AI) replace the document.
  useEffect(() => {
    const v = view.current;
    if (!v || v.state.doc.toString() === value) return;
    v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: value } });
  }, [value]);

  useEffect(() => {
    const v = view.current;
    if (!v) return;
    v.dispatch(
      setDiagnostics(
        v.state,
        diagnostics.map((d) => {
          const from = offsetOf(v.state, d.line, d.col);
          const lineEnd = v.state.doc.lineAt(from).to;
          return {
            from,
            to: Math.max(from, Math.min(lineEnd, from + 1)),
            severity: d.severity,
            message: d.message,
          };
        })
      )
    );
  }, [diagnostics, value]);

  return <div ref={host} className={className} />;
};
