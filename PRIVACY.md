# Privacy Policy

Effective Date: August 4, 2026 (previously June 14, 2025)

This Privacy Policy describes how Resuma handles your data.

---

## 1. Data Collection

Resuma is a local-first application. By default, **no personal data is collected, transmitted, or stored on external servers**. Sending resume content to an external AI provider is possible, but only after you explicitly configure one - see [Section 3](#3-optional-ai-providers).

All resume content, settings, model files, and AI runtime binaries are stored locally on your device:

- **Windows**: `%APPDATA%/com.resuma.app`
- **Linux**: `~/.local/share/com.resuma.app`
- **macOS**: `~/Library/Application Support/com.resuma.app`

We do **not** track usage, collect analytics, or share any data with third parties.

---

## 2. Local Storage

The following data is stored **locally only**:

- Resume files (`.resume`)
- Application settings (`settings.resuma`)
- Exported resumes (PDF/TXT)
- Downloaded local models (e.g., Qwen3 GGUF)
- llama.cpp runtime executables

API keys for external providers are **not** kept in `settings.resuma`. They are stored in your operating system's credential manager (Windows Credential Manager, macOS Keychain, or the Linux Secret Service) and are read only when a request to that provider is made. They are never included in exported settings files.

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

## 4. Third-Party Libraries

Resuma uses various open-source libraries and tools listed in [THIRD_PARTY.md](./THIRD_PARTY.md). These tools do **not** collect data unless explicitly stated.

---

## 5. Your Control

You have full control over all your data. You may delete files, settings, or models at any time using your file system or the in-app UI.

---

## 6. Contact

For questions or privacy-related concerns, contact: [contact@nikolchaa.com](mailto:contact@nikolchaa.com)

---

Thank you for trusting Resuma. ✨
