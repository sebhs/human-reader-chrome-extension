## Installation and Usage of update_extension.py:

### 1. **Install required packages:**
```bash
pip install requests
```

### 2. **Save the script:**
Save it as `update_extension.py` in your extension directory.

### 3. **Run the script:**

**Option A: Interactive mode:**
```bash
python update_extension.py
```

**Option B: Command line mode:**
```bash
python update_extension.py --api-key "your-api-key-here" --path "./extension-folder"
```

**Option C: Create a batch file (Windows):**
```batch
@echo off
echo Updating ElevenLabs Extension...
python update_extension.py --api-key "YOUR_API_KEY" --path "C:\path\to\extension"
pause
```

**Option D: Create a shell script (Linux/Mac):**
```bash
#!/bin/bash
echo "Updating ElevenLabs Extension..."
python3 update_extension.py --api-key "YOUR_API_KEY" --path "/path/to/extension"
read -p "Press enter to continue"
```

### 4. **What the script does:**

1. **Fetches current data:**
   - Available TTS models from ElevenLabs
   - Available voices
   - Your subscription info

2. **Updates extension files:**
   - `popup.html`: Updates the model dropdown with current options
   - `content.js`: Updates the model mapping logic
   - Creates `models.json` and `voices.json` for reference
   - Updates `manifest.json` version (optional)
   - Creates `update_report.txt` with details

3. **Creates backup files** (optional feature you can add):
   - Backs up original files before modifying

### 5. **Security considerations:**

1. **API Key Storage:** The script doesn't store your API key permanently
2. **Backup:** Consider adding backup functionality
3. **Validation:** The script validates API responses

### 6. **Schedule automatic updates (optional):**

**Windows Task Scheduler:**
- Create a task to run weekly
- Use the batch file

**Linux/Mac cron job:**
```bash
# Run every Sunday at 2 AM
0 2 * * 0 /path/to/update_script.sh
```

### 7. **Manual verification after update:**
Always check:
1. The extension loads without errors
2. All models appear in the dropdown
3. TTS works with different models
4. Check the update report for any issues

This script gives you a maintainable way to keep your extension current with ElevenLabs' latest offerings without needing to manually edit code each time they add new models.
