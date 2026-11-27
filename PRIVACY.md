# Privacy Policy

Effective Date: November 27, 2026 (previously November 24, 2026)

This Privacy Policy describes how Resuma handles your data.

---

## 1. Data Collection

Resuma is a local-first application. By default, **no personal data is collected, transmitted, or stored on external servers**. Sending resume content to an external AI provider is possible, but only after you explicitly configure one - see [Section 3](#3-optional-ai-providers). Showing a generic status on your Discord profile is likewise opt-in - see [Section 4](#4-optional-discord-presence) - and so is letting other AI apps on your computer read your resumes - see [Section 5](#5-optional-connection-for-other-ai-apps). When it starts, Resuma asks GitHub whether a newer version is out, without sending anything about you - see [Section 6](#6-update-check).

All resume content, settings, model files, and AI runtime binaries are stored locally on your device:

- **Windows**: `%APPDATA%/com.resuma.app`
- **Linux**: `~/.local/share/com.resuma.app`
- **macOS**: `~/Library/Application Support/com.resuma.app`

We do **not** track usage, collect analytics, or share any data with third parties.

---

## 2. Local Storage

The following data is stored **locally only**:

- Resume files (`.resume`), **encrypted**
- Your profile and application settings (`settings.resuma`), **encrypted**
- Saved templates (`templates/*.rsm`), which hold designs, not personal data
- Exported resumes (PDF/TXT)
- Downloaded local models (e.g., Qwen3 GGUF)
- llama.cpp runtime executables

Resume files and the settings file are encrypted with AES-256-GCM. The key is created on your computer the first time Resuma runs and is kept in your operating system's credential manager (or, where none is reachable, in the encrypted file described below), so Resuma opens your data without a password. This protects copies of your data folder, such as backups, cloud-synced folders or a lost disk. It does not protect against programs running under your own account, which can unlock the data the same way Resuma does.

When encryption is set up, Resuma shows a **recovery key** once (you can show it again in **Settings → App Settings → Data protection**). With it your data folder opens on another computer, or here if the credential manager loses the key. Without it, a lost key means the data can't be opened. To move data to another computer, export an **encrypted backup**: one file with the resumes you pick and, if you want, your profile and settings, protected by a password you choose (derived with Argon2id). Backups are the only way Resuma exports resumes and settings, and they are always encrypted. The PDF and TXT files you export are written as normal, unencrypted files wherever you save them.

API keys for external providers are **not** kept in `settings.resuma`. They are stored in your operating system's credential manager (Windows Credential Manager, macOS Keychain, or the Linux Secret Service) and are read only when a request to that provider is made. They are never included in backups.

On systems where no credential manager is reachable - most often a headless Linux setup with no Secret Service daemon - Resuma falls back to an encrypted file (`secrets.enc`) in the same app data directory, and tells you so in the AI settings. That file is encrypted with a key derived from your machine and user account, which protects it if the file is copied or ends up in a backup, but not from someone who can already run programs as you.

None of this data is uploaded, synced, or shared without explicit user action.

---

## 3. Optional AI Providers

Resuma runs a **local** llama.cpp model by default; nothing leaves your device in that mode.

You may instead configure a different provider in **Settings → AI Settings**:

- **A local model host** on your own machine or network (Ollama, LM Studio, or any compatible endpoint). Data goes only to the address you enter.
- **A cloud API** (Anthropic, OpenAI, Google Gemini, DeepSeek, Kimi, or a custom endpoint), using **your own API key**.

When a cloud provider is selected, the resume text and job description involved in an AI action are sent to that provider over HTTPS. Resuma sends nothing else, adds no telemetry to those requests, and never routes them through servers we control. Switching back to the local provider stops all outbound AI traffic.

**Once data reaches a third-party provider, it is outside Resuma's control.** What that provider does with it is governed entirely by the privacy policy, terms of service, and data-processing agreement between you and them. Depending on the provider, the plan you are on, and the settings of your account, that can include:

- Retaining your prompts and the model's output for a period of time
- Human review of submitted content for abuse or safety monitoring
- Using your content to train or improve their models
- Processing and storing the data in other countries

These practices differ per provider and change over time. **Review the terms of any provider before you enable it**, particularly if your resume contains personal data about anyone other than yourself, or information covered by an employer or client confidentiality obligation. Resuma displays a notice to this effect in the app when you select a third-party provider, but cannot verify or enforce any provider's behaviour.

Two things Resuma does guarantee: it never enables a third-party provider on your behalf, and it never sends your data anywhere you have not explicitly configured.

---

## 4. Optional Discord Presence

Resuma can show a Discord Rich Presence status ("Playing Resuma") on your Discord profile. This is **off by default** and can be turned on or off at any time in **Settings → App Settings → Discord Presence**.

While it is off, Resuma does not connect to Discord at all. When it is on, Resuma talks only to the Discord app running on your own computer, which then shows the status to others according to your Discord settings. Only fixed, generic text is shared - for example "Editing a resume" or "Adjusting settings". Resume titles, resume content, and personal details are never sent.

---

## 5. Optional Connection for Other AI Apps

Resuma can let AI apps on your computer that support the Model Context Protocol (MCP) - for example a desktop AI assistant or a coding tool - work with your resumes. This is **off by default** and is turned on or off in **Settings → AI Settings → Other AI apps**.

While it is off, Resuma does not listen for connections at all. When it is on:

- Resuma listens only on your own computer (`127.0.0.1`), only while it is open, and only answers apps that present the access token shown in that setting. You can make a new token at any time, which disconnects every app using the old one.
- A connected app can list your resumes and read their content and templates, read the built-in and saved templates, ask Resuma to check templates, and get a picture of a page. While a resume is open in the editor, it reads what you see there, including unsaved changes.
- A connected app can **suggest** changes to a resume or suggest saving a template. Suggestions wait under **Suggested changes** until you apply or discard them; nothing is deleted. If you turn on **Apply changes without asking**, suggestions that raise no warnings are applied at once, and you can still undo them. Suggestions are kept only until Resuma is closed.
- **Personal details** (name, email, phone, website and profile links) are left out of everything a connected app receives, including resume titles, unless you turn on sharing for that specific resume. Page pictures show placeholder details instead.
- The same setting lists **recent activity**: which app did what, on which resume, and when (not what it read or sent). This list is kept only until Resuma is closed.

What a connected app does with what it reads is up to that app and, if it uses a cloud AI service, that service. Section 3's advice applies: review the terms of any app and AI service before you connect it.

---

## 6. Update Check

A few seconds after it starts, Resuma asks GitHub for the version number of its latest release and, if it's newer than yours, tells you. The request goes straight to GitHub's public API (`api.github.com`) and carries nothing about you, your settings, or your resumes. Like any request, it shows GitHub your IP address, under [GitHub's privacy statement](https://docs.github.com/site-policy/privacy-policies/github-general-privacy-statement). Resuma doesn't install anything itself: you download the new version yourself.

You can turn this off in **Settings → App Settings → App Updates**, and still check by hand with **Check for Updates**. Without an internet connection, the start-up check stays quiet.

---

## 7. Third-Party Libraries

Resuma uses various open-source libraries and tools listed in [THIRD_PARTY.md](./THIRD_PARTY.md). These tools do **not** collect data unless explicitly stated.

---

## 8. Your Control

You have full control over all your data. You may delete files, settings, or models at any time using your file system or the in-app UI.

---

## 9. Contact

For questions or privacy-related concerns, contact: [contact@nikolchaa.com](mailto:contact@nikolchaa.com)

---

Thank you for trusting Resuma. ✨
