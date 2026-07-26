#!/usr/bin/env python3
"""Generate App Store screenshots for GAOEX Connect at required sizes.

Outputs:
  store-assets/screenshots/iphone-6.9/*.png  (1320 × 2868)
  store-assets/screenshots/ipad-13/*.png     (2064 × 2752)
"""

from __future__ import annotations

import base64
import pathlib
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parents[1]
ICON = ROOT / "icon" / "AppIcon-1024.png"
OUT_IPHONE = ROOT / "screenshots" / "iphone-6.9"
OUT_IPAD = ROOT / "screenshots" / "ipad-13"

IPHONE = (1320, 2868)
IPAD = (2064, 2752)

SCREENS = [
    {
        "id": "01-welcome",
        "caption": "Connect your internship community",
        "sub": "Secure Google sign-in. Built for facilitators and interns.",
        "kind": "login",
    },
    {
        "id": "02-programs",
        "caption": "All your programs in one place",
        "sub": "Join with an invite code or open a cohort workspace.",
        "kind": "programs",
    },
    {
        "id": "03-channels",
        "caption": "Channels organized by category",
        "sub": "Announcements, team chat, and resources — clearly structured.",
        "kind": "channels",
    },
    {
        "id": "04-messaging",
        "caption": "Real-time messaging that feels native",
        "sub": "Threads, reactions, mentions, and file sharing.",
        "kind": "messaging",
    },
    {
        "id": "05-dms",
        "caption": "Direct messages & groups",
        "sub": "1:1 and small-group chats with presence and typing indicators.",
        "kind": "dms",
    },
    {
        "id": "06-search",
        "caption": "Find people, channels, and messages",
        "sub": "Search across your workspace instantly.",
        "kind": "search",
    },
]


def icon_data_uri() -> str:
    data = ICON.read_bytes()
    b64 = base64.b64encode(data).decode("ascii")
    return f"data:image/png;base64,{b64}"


def phone_chrome(inner: str, width: int) -> str:
    """Wrap inner UI in a phone-like frame."""
    return f"""
    <div class="device" style="width:{width}px">
      <div class="notch"></div>
      <div class="screen">{inner}</div>
      <div class="home-bar"></div>
    </div>
    """


def ui_login(icon: str) -> str:
    return f"""
    <div class="ui login">
      <div class="login-hero">
        <img class="app-icon" src="{icon}" alt="" />
        <div class="app-name">GAOEX Connect</div>
        <div class="app-tag">Connect with your internship community</div>
      </div>
      <button class="google-btn">
        <span class="g">G</span> Continue with Google
      </button>
    </div>
    """


def ui_programs() -> str:
    cards = [
        ("GAOEX Summer ’26", "42 members · 8 channels"),
        ("Mentorship Circle", "18 members · 4 channels"),
        ("Alumni Network", "120 members · 12 channels"),
    ]
    cards_html = "".join(
        f"""
        <div class="prog-card">
          <div class="prog-avatar">{name[0]}</div>
          <div>
            <div class="prog-title">{name}</div>
            <div class="prog-meta">{meta}</div>
          </div>
        </div>
        """
        for name, meta in cards
    )
    return f"""
    <div class="ui">
      <div class="nav">
        <div class="nav-title">Programs</div>
        <div class="nav-actions">＋</div>
      </div>
      <div class="body">
        {cards_html}
      </div>
      <div class="tabbar">
        <span class="on">Programs</span><span>DMs</span><span>Search</span><span>Profile</span>
      </div>
    </div>
    """


def ui_channels() -> str:
    return """
    <div class="ui">
      <div class="nav tall">
        <div class="nav-kicker">GAOEX Summer ’26</div>
        <div class="nav-title">Program</div>
        <div class="action-strip">
          <span>Members</span><span>Roles</span><span>Invite</span>
        </div>
      </div>
      <div class="body">
        <div class="cat">GENERAL</div>
        <div class="chan"><span class="hash">#</span> announcements <span class="badge">3</span></div>
        <div class="chan"><span class="hash">#</span> general</div>
        <div class="chan"><span class="hash">#</span> introductions</div>
        <div class="cat">TEAMS</div>
        <div class="chan"><span class="hash">#</span> engineering</div>
        <div class="chan"><span class="hash">#</span> design</div>
        <div class="chan"><span class="hash">#</span> research</div>
      </div>
      <div class="tabbar">
        <span class="on">Programs</span><span>DMs</span><span>Search</span><span>Profile</span>
      </div>
    </div>
    """


def ui_messaging() -> str:
    return """
    <div class="ui">
      <div class="nav">
        <div class="nav-title"># general</div>
        <div class="nav-actions">🔔</div>
      </div>
      <div class="body chat">
        <div class="msg">
          <div class="av">A</div>
          <div>
            <div class="msg-h"><b>Aisha</b> <span>9:41 AM</span></div>
            <div class="msg-b">Welcome everyone — kickoff is Friday at 10am. Please introduce yourselves in #introductions 👋</div>
            <div class="rx">👍 12 · 🎉 5</div>
          </div>
        </div>
        <div class="msg">
          <div class="av gold">R</div>
          <div>
            <div class="msg-h"><b>Ritesh</b> <span>9:44 AM</span></div>
            <div class="msg-b">Excited to be here! Looking forward to collaborating with the cohort.</div>
            <div class="thread">3 replies</div>
          </div>
        </div>
        <div class="msg">
          <div class="av">M</div>
          <div>
            <div class="msg-h"><b>Maya</b> <span>9:52 AM</span></div>
            <div class="msg-b">Shared the onboarding PDF — check pinned messages.</div>
            <div class="file">📎 Onboarding_Guide.pdf</div>
          </div>
        </div>
      </div>
      <div class="composer">Message #general</div>
    </div>
    """


def ui_dms() -> str:
    rows = [
        ("Priya Chen", "Can you review the draft?", "2m", True),
        ("Facilitator Team", "Meeting moved to 3pm", "1h", False),
        ("Jordan Lee", "Thanks for the feedback!", "Yesterday", False),
    ]
    rows_html = "".join(
        f"""
        <div class="dm-row">
          <div class="av {'gold' if unread else ''}">{name[0]}</div>
          <div class="dm-text">
            <div class="dm-top"><b>{name}</b><span>{when}</span></div>
            <div class="dm-preview {'unread' if unread else ''}">{preview}</div>
          </div>
        </div>
        """
        for name, preview, when, unread in rows
    )
    return f"""
    <div class="ui">
      <div class="nav">
        <div class="nav-title">Messages</div>
        <div class="nav-actions">✎</div>
      </div>
      <div class="body">{rows_html}</div>
      <div class="tabbar">
        <span>Programs</span><span class="on">DMs</span><span>Search</span><span>Profile</span>
      </div>
    </div>
    """


def ui_search() -> str:
    return """
    <div class="ui">
      <div class="nav">
        <div class="search-box">🔍  onboarding</div>
      </div>
      <div class="body">
        <div class="sec">MESSAGES</div>
        <div class="hit">
          <div class="hit-t"># general · Maya</div>
          <div class="hit-b">Shared the <mark>onboarding</mark> PDF — check pinned…</div>
        </div>
        <div class="hit">
          <div class="hit-t"># announcements · Aisha</div>
          <div class="hit-b">Please complete <mark>onboarding</mark> by Friday</div>
        </div>
        <div class="sec">CHANNELS</div>
        <div class="hit"><div class="hit-t"># onboarding-help</div></div>
        <div class="sec">PEOPLE</div>
        <div class="hit"><div class="hit-t">Omar · Mentorship Circle</div></div>
      </div>
      <div class="tabbar">
        <span>Programs</span><span>DMs</span><span class="on">Search</span><span>Profile</span>
      </div>
    </div>
    """


def build_ui(kind: str, icon: str) -> str:
    return {
        "login": ui_login(icon),
        "programs": ui_programs(),
        "channels": ui_channels(),
        "messaging": ui_messaging(),
        "dms": ui_dms(),
        "search": ui_search(),
    }[kind]


def html_page(screen: dict, size: tuple[int, int], icon: str) -> str:
    w, h = size
    is_phone = size == IPHONE
    device_w = 980 if is_phone else 1180
    caption_size = 72 if is_phone else 64
    sub_size = 34 if is_phone else 32
    pad_top = 160 if is_phone else 120

    inner = build_ui(screen["kind"], icon)
    device = phone_chrome(inner, device_w)

    return f"""<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<style>
  @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap');
  * {{ box-sizing: border-box; margin: 0; padding: 0; }}
  html, body {{
    width: {w}px; height: {h}px; overflow: hidden;
    font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif;
    background: #000;
    color: #fff;
  }}
  .slide {{
    width: {w}px; height: {h}px;
    background:
      radial-gradient(1200px 800px at 50% -10%, rgba(10,132,255,0.35), transparent 55%),
      radial-gradient(900px 700px at 80% 90%, rgba(255,215,0,0.12), transparent 50%),
      linear-gradient(180deg, #050508 0%, #000 40%, #0A0A0F 100%);
    display: flex; flex-direction: column; align-items: center;
    padding: {pad_top}px 64px 80px;
  }}
  .caption {{
    text-align: center; max-width: 1100px;
    font-size: {caption_size}px; font-weight: 700; letter-spacing: -0.02em;
    line-height: 1.15; margin-bottom: 18px;
  }}
  .sub {{
    text-align: center; max-width: 980px;
    font-size: {sub_size}px; font-weight: 400; color: #A0A4B0;
    line-height: 1.35; margin-bottom: 48px;
  }}
  .device {{
    flex: 1; max-height: {h - pad_top - 280}px;
    background: #0A0A0F;
    border-radius: 56px;
    border: 3px solid #1C1C2A;
    box-shadow: 0 40px 120px rgba(10,132,255,0.18), 0 0 0 1px rgba(255,255,255,0.04);
    overflow: hidden; position: relative;
    display: flex; flex-direction: column;
  }}
  .notch {{
    height: 36px; display: flex; align-items: center; justify-content: center;
    background: #0A0A0F; flex-shrink: 0;
  }}
  .notch::after {{
    content: ''; width: 160px; height: 22px; background: #000; border-radius: 20px;
  }}
  .home-bar {{
    height: 28px; display: flex; align-items: center; justify-content: center;
    flex-shrink: 0;
  }}
  .home-bar::after {{
    content: ''; width: 140px; height: 5px; background: #333; border-radius: 4px;
  }}
  .screen {{ flex: 1; overflow: hidden; background: #000; display: flex; }}
  .ui {{ flex: 1; display: flex; flex-direction: column; background: #000; min-height: 0; }}
  .nav {{
    padding: 28px 32px 18px; border-bottom: 1px solid #1C1C2A;
    display: flex; align-items: center; justify-content: space-between;
  }}
  .nav.tall {{ flex-direction: column; align-items: flex-start; gap: 10px; }}
  .nav-kicker {{ color: #A0A4B0; font-size: 22px; }}
  .nav-title {{ font-size: 36px; font-weight: 700; }}
  .nav-actions {{ color: #0A84FF; font-size: 32px; }}
  .action-strip {{ display: flex; gap: 12px; margin-top: 6px; }}
  .action-strip span {{
    background: #111118; border: 1px solid #1C1C2A; color: #fff;
    padding: 10px 18px; border-radius: 12px; font-size: 20px;
  }}
  .body {{ flex: 1; padding: 20px 28px; overflow: hidden; }}
  .tabbar {{
    display: grid; grid-template-columns: repeat(4, 1fr);
    border-top: 1px solid #1C1C2A; padding: 18px 8px 22px;
    color: #5C5F6A; font-size: 18px; text-align: center;
  }}
  .tabbar .on {{ color: #0A84FF; font-weight: 600; }}
  .prog-card {{
    display: flex; gap: 18px; align-items: center;
    background: #111118; border: 1px solid #1C1C2A;
    border-radius: 18px; padding: 22px; margin-bottom: 16px;
  }}
  .prog-avatar {{
    width: 56px; height: 56px; border-radius: 14px;
    background: #0A84FF; display: grid; place-items: center;
    font-weight: 700; font-size: 26px;
  }}
  .prog-title {{ font-size: 26px; font-weight: 600; }}
  .prog-meta {{ color: #A0A4B0; font-size: 20px; margin-top: 4px; }}
  .cat {{
    color: #5C5F6A; font-size: 18px; font-weight: 700;
    letter-spacing: 0.08em; margin: 18px 0 10px;
  }}
  .chan {{
    display: flex; align-items: center; gap: 10px;
    font-size: 26px; color: #D1D1D6; padding: 14px 8px;
  }}
  .hash {{ color: #636366; }}
  .badge {{
    margin-left: auto; background: #0A84FF; color: #fff;
    font-size: 16px; font-weight: 700; padding: 4px 10px; border-radius: 999px;
  }}
  .chat .msg {{ display: flex; gap: 14px; margin-bottom: 28px; }}
  .av {{
    width: 48px; height: 48px; border-radius: 16px; background: #0A84FF;
    display: grid; place-items: center; font-weight: 700; flex-shrink: 0;
  }}
  .av.gold {{ background: #FFD700; color: #000; }}
  .msg-h {{ font-size: 22px; margin-bottom: 6px; }}
  .msg-h span {{ color: #5C5F6A; font-size: 18px; margin-left: 8px; }}
  .msg-b {{ font-size: 24px; line-height: 1.35; color: #fff; }}
  .rx {{ margin-top: 10px; color: #A0A4B0; font-size: 18px; }}
  .thread {{ margin-top: 10px; color: #0A84FF; font-size: 20px; font-weight: 600; }}
  .file {{
    margin-top: 12px; background: #111118; border: 1px solid #1C1C2A;
    border-radius: 12px; padding: 14px 16px; font-size: 20px; color: #D1D1D6;
  }}
  .composer {{
    margin: 0 20px 16px; padding: 18px 22px; border-radius: 22px;
    background: #111118; border: 1px solid #1C1C2A; color: #5C5F6A; font-size: 22px;
  }}
  .dm-row {{ display: flex; gap: 16px; padding: 18px 4px; border-bottom: 1px solid #1C1C2A; }}
  .dm-top {{ display: flex; justify-content: space-between; font-size: 24px; }}
  .dm-top span {{ color: #5C5F6A; font-size: 18px; }}
  .dm-preview {{ color: #A0A4B0; font-size: 20px; margin-top: 4px; }}
  .dm-preview.unread {{ color: #fff; font-weight: 600; }}
  .search-box {{
    width: 100%; background: #111118; border: 1px solid #1C1C2A;
    border-radius: 14px; padding: 16px 18px; color: #A0A4B0; font-size: 24px;
  }}
  .sec {{ color: #5C5F6A; font-size: 18px; font-weight: 700; letter-spacing: 0.06em; margin: 20px 0 10px; }}
  .hit {{ padding: 14px 4px; border-bottom: 1px solid #1C1C2A; }}
  .hit-t {{ font-size: 24px; font-weight: 600; }}
  .hit-b {{ font-size: 20px; color: #A0A4B0; margin-top: 4px; }}
  mark {{ background: rgba(10,132,255,0.25); color: #fff; padding: 0 4px; border-radius: 4px; }}
  .login {{
    justify-content: space-between; padding: 80px 40px 48px;
  }}
  .login-hero {{ flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 18px; }}
  .app-icon {{ width: 160px; height: 160px; border-radius: 36px; }}
  .app-name {{ font-size: 48px; font-weight: 700; }}
  .app-tag {{ color: #A0A4B0; font-size: 26px; text-align: center; }}
  .google-btn {{
    width: 100%; background: #fff; color: #000; border: 0;
    border-radius: 16px; padding: 22px; font-size: 26px; font-weight: 600;
    display: flex; align-items: center; justify-content: center; gap: 12px;
  }}
  .g {{
    width: 28px; height: 28px; border-radius: 50%; background: #4285F4; color: #fff;
    display: grid; place-items: center; font-size: 16px; font-weight: 700;
  }}
</style>
</head>
<body>
  <div class="slide">
    <div class="caption">{screen["caption"]}</div>
    <div class="sub">{screen["sub"]}</div>
    {device}
  </div>
</body>
</html>
"""


def render_all() -> None:
    OUT_IPHONE.mkdir(parents=True, exist_ok=True)
    OUT_IPAD.mkdir(parents=True, exist_ok=True)
    icon = icon_data_uri()

    with sync_playwright() as p:
        browser = p.chromium.launch()
        for screen in SCREENS:
            for label, size, out_dir in (
                ("iphone", IPHONE, OUT_IPHONE),
                ("ipad", IPAD, OUT_IPAD),
            ):
                w, h = size
                page = browser.new_page(viewport={"width": w, "height": h}, device_scale_factor=1)
                page.set_content(html_page(screen, size, icon), wait_until="networkidle")
                # Wait for webfont
                page.wait_for_timeout(800)
                path = out_dir / f"{screen['id']}.png"
                page.screenshot(path=str(path), type="png")
                page.close()
                print(f"wrote {path.relative_to(ROOT)} ({w}x{h})")
        browser.close()


if __name__ == "__main__":
    if not ICON.exists():
        raise SystemExit(f"Missing icon: {ICON}")
    render_all()
    print("Done.")
