# OpenVPB → Google Voice Bridge

A [Tampermonkey](https://www.tampermonkey.net/) userscript that turns [OpenVPB](https://www.openvpb.com/) phone banking into a one-keystroke dialing workflow using Google Voice. Press a key on the OpenVPB contact screen and the current contact is dialed in a reused Google Voice tab — no copying numbers, no clicking around.

Built for high-volume volunteer phone banking, with a daily call counter so you can track your own progress.

## Features

- **One-key dialing** — press `D` on an OpenVPB contact to dial them in Google Voice.
- **Single reused tab** — keeps one Google Voice tab open and reuses it for every call instead of spawning new ones.
- **Keyboard call control** — on the Google Voice side, `Enter` confirms the call and `E` ends it, so you can dial and hang up without touching the mouse.
- **Daily call counter** — counts calls placed and resets automatically each day.
- **Phone number normalization** — accepts 10- or 11-digit US numbers and formats them automatically.
- **On-screen status box** — shows the current contact, number, call count, and whether the Google Voice tab is connected.

## Requirements

- A Chromium-based or Firefox browser with the **Tampermonkey** extension installed.
- A **Google Voice** account set up for calling.
- Access to an **OpenVPB** virtual phone bank.

## Installation

1. Install the Tampermonkey browser extension if you haven't already.
2. Open `openvpb-gv-bridge.user.js` in this repository and click the **Raw** button.
3. Tampermonkey will detect the userscript and prompt you to install it. Confirm the install.
4. Make sure the script is enabled in the Tampermonkey dashboard.

## Configuration

> **Important:** This script assumes your Google Voice account is at account index **3** (`/u/3/`). This is set near the top of the script:
>
> ```js
> const GV_BASE = "https://voice.google.com/u/3/calls?a=nc,";
> ```
>
> If your Voice account is your only or first Google account, this will likely need to be `/u/0/`. If you're signed into multiple Google accounts, the index matches the order Google assigns them. Edit this line to match your setup, or the dial may open the wrong account.

## Usage

1. Open your OpenVPB virtual phone bank and start a session. A status box appears at the top of the screen.
2. When a contact loads, the box shows their name and number.
3. Press `D` (or click the **Dial in Google Voice** button) to dial.
   - The first time, this opens a Google Voice tab. Wait a moment for it to connect, then press `D` again.
   - The status box shows **Voice: connected** once the tab is ready.
4. In the Google Voice tab, press `Enter` to confirm the call.
5. Press `E` to end the call.
6. Your call count for the day is tracked in the status box.

## How it works

The script runs on two pages — OpenVPB and Google Voice — and the two instances talk to each other through Tampermonkey's cross-tab storage (`GM_setValue` / `GM_getValue` / `GM_addValueChangeListener`).

On OpenVPB it reads the current contact's name and phone number, normalizes the number to E.164 format, and writes a "dial request" into shared storage. The Google Voice instance listens for that request, navigates to the dial URL, and then locates the Call button — including traversing shadow DOM, since Google Voice's web UI is built from web components — so the `Enter` and `E` hotkeys can drive the call.

## Notes and limitations

- The Call-button detection is built around Google Voice's current web UI. If Google changes that UI, the button-finding logic may need updating.
- The account index (`/u/3/`) is hardcoded — see Configuration above.
- The daily counter is stored locally in the browser and is per-device.
