"""
Publish MySkedul APKs to Telegram channel threads using Pyrogram (MTProto).
"""

import asyncio
import html
import os
import subprocess
import sys

from pyrogram import Client
from pyrogram.enums import ParseMode

def format_changelog_line(line):
    line_clean = line.strip()
    if not line_clean:
        return ""
    
    if line_clean.startswith(('•', '-', '*')):
        return line_clean
        
    lower_line = line_clean.lower()
    
    # Choose emoji based on keywords
    if any(k in lower_line for k in ['perf', 'speed', 'fast', 'optimis', 'optimiz', 'instant', 'lag-free', 'lag', 'laggy']):
        emoji = "⚡"
    elif any(k in lower_line for k in ['search', 'find', 'query', 'group', 'section']):
        emoji = "👥"
    elif any(k in lower_line for k in ['db', 'database', 'migration', 'schema', 'sqlite', 'indexeddb', 'idb', 'storage']):
        emoji = "💾"
    elif any(k in lower_line for k in ['backup', 'restore', 'zip', 'export', 'import', 'downloads', 'documents']):
        emoji = "📦"
    elif any(k in lower_line for k in ['gradle', 'build', 'ci', 'workflow', 'version', 'github', 'action']):
        emoji = "🔧"
    elif any(k in lower_line for k in ['fix', 'bug', 'crash', 'error', 'resolve', 'issue', 'prune', 'cleanup']):
        emoji = "🛠️"
    elif any(k in lower_line for k in ['feat', 'add', 'new', 'introduce', 'implement']):
        emoji = "✨"
    elif any(k in lower_line for k in ['ui', 'ux', 'layout', 'design', 'theme', 'color', 'screen', 'font', 'card', 'modal', 'popup', 'loading', 'loader']):
        emoji = "🎨"
    else:
        emoji = "✨"
        
    if ":" in line_clean:
        parts = line_clean.split(":", 1)
        prefix = parts[0].strip()
        suffix = parts[1].strip()
        if suffix:
            suffix = suffix[0].upper() + suffix[1:]
        return f"• {emoji} <b>{prefix}:</b> {suffix}"
    else:
        if line_clean:
            line_clean = line_clean[0].upper() + line_clean[1:]
        return f"• {emoji} {line_clean}"

def get_commit_info():
    try:
        author = subprocess.check_output(
            ["git", "log", "-1", "--pretty=format:%an"]
        ).decode("utf-8").strip()
        message = subprocess.check_output(
            ["git", "log", "-1", "--pretty=format:%B"]
        ).decode("utf-8").strip()
        message = "\n".join(line for line in message.split("\n") if line.strip())
    except Exception:
        author = "Unknown"
        message = "New release build"
    return html.escape(author), html.escape(message)

async def publish():
    api_id     = int(os.environ["TELEGRAM_API_ID"])
    api_hash   = os.environ["TELEGRAM_API_HASH"]
    bot_token  = os.environ["TELEGRAM_BOT_TOKEN"]
    chat_id    = os.environ["TELEGRAM_CHAT_ID"]
    thread_id  = os.environ.get("TELEGRAM_THREAD_ID", "")
    version    = os.environ["VERSION_NAME"]
    commit_sha = os.environ["COMMIT_SHA"]
    is_release = os.environ.get("IS_RELEASE", "false").strip().lower() == "true"

    commit_author, commit_message = get_commit_info()

    if is_release:
        apks = [
            (f"MySkedulAPP/android/app/build/outputs/apk/release/MySkedul-v{version}-high.apk", "MySkedul-v{version}-high.apk", f"📱 <b>MySkedul High-end (ARM64) — v{version}</b>"),
            (f"MySkedulAPP/android/app/build/outputs/apk/release/MySkedul-v{version}-low.apk", "MySkedul-v{version}-low.apk", f"📱 <b>MySkedul Low-end (ARMv7) — v{version}</b>")
        ]
    else:
        apks = [
            (f"MySkedulAPP/android/app/build/outputs/apk/nightly/MySkedul-v{version}-nightly-high.apk", "MySkedul-v{version}-nightly-high.apk", f"📱 <b>MySkedul Nightly High-end (ARM64) — v{version}</b>"),
            (f"MySkedulAPP/android/app/build/outputs/apk/nightly/MySkedul-v{version}-nightly-low.apk", "MySkedul-v{version}-nightly-low.apk", f"📱 <b>MySkedul Nightly Low-end (ARMv7) — v{version}</b>")
        ]

    # Filter to files that actually exist
    existing_apks = []
    for apk_path, display_name, caption in apks:
        if os.path.exists(apk_path):
            size_mb = os.path.getsize(apk_path) / (1024 * 1024)
            print(f"  Found: {apk_path} ({size_mb:.1f} MB)", flush=True)
            existing_apks.append((apk_path, display_name, caption))
        else:
            print(f"  Skipped (not found): {apk_path}", flush=True)

    if not existing_apks:
        print("ERROR: No APK files found to publish!", flush=True)
        sys.exit(1)

    apks = existing_apks
    reply_to = int(thread_id) if thread_id else None

    async with Client(
        name="myskedul_publisher",
        api_id=api_id,
        api_hash=api_hash,
        bot_token=bot_token,
        in_memory=True,
        workers=4,
        max_concurrent_transmissions=2,
        sleep_threshold=60,
    ) as app:
        # Get changelog from environment, fallback to commit message if empty
        changelog = os.environ.get("CHANGELOG", "").strip()
        if not changelog:
            changelog = f"<blockquote>{commit_message}</blockquote>"

        if is_release:
            # Clean up HTML/Markdown blockquote tags and format each line
            clean_changelog = changelog
            if clean_changelog.startswith("<blockquote>"):
                clean_changelog = clean_changelog[len("<blockquote>"):]
            if clean_changelog.endswith("</blockquote>"):
                clean_changelog = clean_changelog[:-len("</blockquote>")]
            
            clean_changelog = clean_changelog.replace("<br>", "\n").replace("<br/>", "\n").replace("<br />", "\n")
            changelog_lines = [line.strip() for line in clean_changelog.split("\n") if line.strip()]

            # Format the commits in changelog with emojis and bullets
            formatted_lines = []
            for line in changelog_lines:
                formatted = format_changelog_line(line)
                if formatted:
                    formatted_lines.append(formatted)
            
            changelog_block = "<blockquote>" + "\n\n".join(formatted_lines) + "</blockquote>"

            text = (
                f"📅 <b>MySkedul v{html.escape(version)} Release</b> 📅\n\n"
                f"A new stable version of the Premium Academic OS is here: <b>MySkedul v{html.escape(version)}</b>! "
                f"Experience refined schedule management, fluid UI optimizations, and crucial database fixes.\n\n"
                f"🚀 <b>What's New & Improved:</b>\n\n"
                f"{changelog_block}\n"
                f"------------------------------------\n"
                f"💡 <b>Which APK to install?</b>\n"
                f"<blockquote>• <b>High-end (ARM64-v8a):</b> Recommended for all modern devices (64-bit).\n"
                f"• <b>Low-end (ARMeabi-v7a):</b> Recommended for older / budget devices (32-bit).</blockquote>\n"
                f"------------------------------------\n"
                f"📦 <b>Direct Downloads:</b>\n"
                f"• <a href=\"https://github.com/ianshulyadav/MySkedul/releases/download/v{html.escape(version)}/MySkedul-v{html.escape(version)}-high.apk\">MySkedul-v{html.escape(version)}-high.apk</a> (High-end)\n"
                f"• <a href=\"https://github.com/ianshulyadav/MySkedul/releases/download/v{html.escape(version)}/MySkedul-v{html.escape(version)}-low.apk\">MySkedul-v{html.escape(version)}-low.apk</a> (Low-end)"
            )

            print("Sending changelog text message...", flush=True)
            changelog_msg = await app.send_message(
                chat_id=chat_id,
                text=text,
                parse_mode=ParseMode.HTML,
                reply_to_message_id=reply_to,
                disable_web_page_preview=True,
            )
            print(f"Changelog message sent. ID: {changelog_msg.id}", flush=True)

            for apk_path, display_name, cap in apks:
                size_mb = os.path.getsize(apk_path) / (1024 * 1024)
                print(f"Uploading {display_name} ({size_mb:.1f} MB)...", flush=True)

                max_retries = 3
                for attempt in range(1, max_retries + 1):
                    try:
                        await app.send_document(
                            chat_id=chat_id,
                            document=apk_path,
                            file_name=display_name,
                            caption=cap,
                            parse_mode=ParseMode.HTML,
                            reply_to_message_id=reply_to,
                            force_document=True,
                        )
                        print(f"  OK — sent {display_name}", flush=True)
                        break
                    except Exception as e:
                        print(f"  [Attempt {attempt}/{max_retries}] Failed to upload {display_name}: {e}", flush=True)
                        if attempt == max_retries:
                            raise e
                        await asyncio.sleep(5 * attempt)

        else:
            # Nightly / Debug Build format
            text = (
                f"🛠️ <b>MySkedul Nightly Build</b> 🛠️\n\n"
                f"Commit by: {commit_author}\n"
                f"Commit message:\n<blockquote>{commit_message}</blockquote>\n"
                f"Commit hash: #{commit_sha[:7]}\n"
                f"Version: v{version}-nightly\n\n"
                f"💡 <b>Which APK to install?</b>\n"
                f"<blockquote>• <b>High-end:</b> Modern devices (ARM64-v8a)\n"
                f"• <b>Low-end:</b> Older/budget devices (ARMeabi-v7a)</blockquote>"
            )

            print("Sending nightly build text message...", flush=True)
            await app.send_message(
                chat_id=chat_id,
                text=text,
                parse_mode=ParseMode.HTML,
                reply_to_message_id=reply_to,
                disable_web_page_preview=True,
            )

            for apk_path, display_name, cap in apks:
                size_mb = os.path.getsize(apk_path) / (1024 * 1024)
                print(f"Uploading nightly build {display_name} ({size_mb:.1f} MB)...", flush=True)

                max_retries = 3
                for attempt in range(1, max_retries + 1):
                    try:
                        await app.send_document(
                            chat_id=chat_id,
                            document=apk_path,
                            file_name=display_name,
                            caption=cap,
                            parse_mode=ParseMode.HTML,
                            reply_to_message_id=reply_to,
                            force_document=True,
                        )
                        print(f"  OK — sent {display_name}", flush=True)
                        break
                    except Exception as e:
                        print(f"  [Attempt {attempt}/{max_retries}] Failed to upload {display_name}: {e}", flush=True)
                        if attempt == max_retries:
                            raise e
                        await asyncio.sleep(5 * attempt)

    print("All APKs published successfully.", flush=True)

if __name__ == "__main__":
    asyncio.run(publish())
