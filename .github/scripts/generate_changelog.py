import subprocess
import html
import os
import json
import re

def get_current_version():
    try:
        with open("version.json", "r", encoding="utf-8") as f:
            data = json.load(f)
            return data.get("version")
    except Exception:
        return None

def get_changelog_from_json():
    try:
        with open("version.json", "r", encoding="utf-8") as f:
            data = json.load(f)
            changelog_list = data.get("changelog", [])
            return "\n".join(changelog_list)
    except Exception:
        return None

def clean_for_telegram(html_content):
    # Strip style/color/class/data attributes from HTML tags to make them clean for Telegram
    # Telegram only supports a very limited set of HTML tags: <b>, <i>, <a>, <code>, <pre>, <blockquote> etc.
    # We clean custom styling tags like <i data-lucide='rocket' style='color:#FF6B6B; width:18px;'></i> and turn them into text/emojis if possible.
    clean = html_content
    # Replace icons with standard bullets or simple emojis
    clean = re.sub(r"<i\s+[^>]*data-lucide=['\"]rocket['\"][^>]*>\s*</i>", "🚀", clean)
    clean = re.sub(r"<i\s+[^>]*data-lucide=['\"]users['\"][^>]*>\s*</i>", "👥", clean)
    clean = re.sub(r"<i\s+[^>]*data-lucide=['\"]cloud-download['\"][^>]*>\s*</i>", "☁️", clean)
    clean = re.sub(r"<i\s+[^>]*data-lucide=['\"]hammer['\"][^>]*>\s*</i>", "🛠️", clean)
    # Remove any remaining <i> tags with attributes
    clean = re.sub(r"<i\s+[^>]*>", "", clean)
    clean = clean.replace("</i>", "")
    
    # Strip non-standard attributes from all other supported tags
    clean = re.sub(r"<(b|i|strong|em|code|pre|a|blockquote)\s+[^>]*>", r"<\1>", clean)
    return clean

def main():
    version = get_current_version()
    print(f"Detected version: {version}")
    
    changelog_raw = ""
    changelog_html = ""
    
    if version:
        changelog_raw = get_changelog_from_json()
        if changelog_raw:
            print("Successfully extracted changelog from version.json")
            # Format clean list of lines for Telegram
            changelog_html = clean_for_telegram(changelog_raw)
            
    # Fallback to git log if version.json extraction fails
    if not changelog_raw:
        print("Fallback: Using git log for changelog generation")
        prev_sha = os.environ.get('PREV_SHA', '')
        curr_sha = os.environ.get('CURR_SHA', '')
        if prev_sha and prev_sha != '0000000000000000000000000000000000000000':
            cmd = ['git', 'log', '--pretty=format:%s', f'{prev_sha}..{curr_sha}']
        else:
            cmd = ['git', 'log', '-n', '20', '--pretty=format:%s']
            
        try:
            output = subprocess.check_output(cmd).decode('utf-8', errors='ignore')
            raw_commits = [line.strip() for line in output.split('\n') if line.strip()]
        except Exception:
            raw_commits = ['New release build']
            
        ignored_patterns = [
            r"^ci:", r"^workflow", r"telegram", r"github", r"gitHub", r"Telegram", r"GitHub",
            r"dependabot", r"bump the github-actions", r"bump the gradle-dependencies", r"\[skip ci\]"
        ]
        
        commits = []
        for c in raw_commits:
            if any(re.search(pat, c, re.IGNORECASE) for pat in ignored_patterns):
                continue
            commits.append(c)
            
        if not commits:
            commits = ['Performance enhancements and bug fixes']
            
        changelog_html = '\n'.join('• ' + c for c in commits)
        changelog_raw = '\n'.join('- ' + c for c in commits)
    
    # Wrap HTML in <blockquote> tags for Telegram formatting compatibility
    changelog_html_wrapped = '<blockquote>' + changelog_html + '</blockquote>'
        
    github_output = os.environ.get('GITHUB_OUTPUT')
    if github_output:
        with open(github_output, 'a', encoding='utf-8') as f:
            f.write('changelog_html<<EOF\n' + changelog_html_wrapped + '\nEOF\n')
            f.write('changelog_md<<EOF\n' + changelog_raw + '\nEOF\n')
    else:
        print("GITHUB_OUTPUT not set. Changelog HTML:\n", changelog_html_wrapped)
        print("Changelog Raw:\n", changelog_raw)

if __name__ == '__main__':
    main()
