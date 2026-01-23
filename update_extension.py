#!/usr/bin/env python3
# /// script
# requires-python = ">=3.12"
# dependencies = [
#     "requests",
# ]
# ///
"""
ElevenLabs Chrome Extension Updater
Fetches current models and voices from ElevenLabs API and updates the extension files.
Run this occasionally to keep your extension up-to-date.
"""

import json
import os
import re
import requests
from pathlib import Path
from getpass import getpass

class ElevenLabsExtensionUpdater:
    def __init__(self, api_key, extension_path="."):
        """
        Initialize the updater.
        
        Args:
            api_key: Your ElevenLabs API key
            extension_path: Path to the extension directory
        """
        self.api_key = api_key
        self.extension_path = Path(extension_path)
        self.headers = {
            "xi-api-key": api_key,
            "Content-Type": "application/json"
        }
        self.base_url = "https://api.elevenlabs.io/v1"
        
    def fetch_models(self):
        """Fetch available models from ElevenLabs API."""
        print("Fetching available models...")
        try:
            response = requests.get(f"{self.base_url}/models", headers=self.headers)
            response.raise_for_status()
            data = response.json()
            
            # Filter for TTS models only
            tts_models = [
                model for model in data
                if model.get("can_do_text_to_speech", False)
            ]
            
            print(f"Found {len(tts_models)} TTS models")
            return tts_models
        except requests.exceptions.RequestException as e:
            print(f"Error fetching models: {e}")
            return []
    
    def fetch_voices(self):
        """Fetch available voices from ElevenLabs API."""
        print("Fetching available voices...")
        try:
            response = requests.get(f"{self.base_url}/voices", headers=self.headers)
            response.raise_for_status()
            data = response.json()
            
            voices = data.get("voices", [])
            print(f"Found {len(voices)} voices")
            return voices
        except requests.exceptions.RequestException as e:
            print(f"Error fetching voices: {e}")
            return []
    
    def get_user_subscription(self):
        """Get user subscription info to see available features."""
        print("Fetching subscription info...")
        try:
            response = requests.get(f"{self.base_url}/user/subscription", headers=self.headers)
            response.raise_for_status()
            return response.json()
        except requests.exceptions.RequestException as e:
            print(f"Error fetching subscription: {e}")
            return {}
    
    def format_model_for_dropdown(self, model):
        """Format model data for HTML dropdown."""
        model_id = model.get("model_id", "")
        name = model.get("name", model_id)
        description = model.get("description", "")
        
        # Create a readable label
        label = f"{name}"
        if description:
            label = f"{name} - {description[:50]}..."
        
        return {
            "value": model_id,
            "label": label,
            "name": name,
            "description": description
        }
    
    def format_voice_for_dropdown(self, voice):
        """Format voice data for dropdown."""
        print(voice)
        voice_id = voice.get("voice_id", "")
        name = voice.get("name", voice_id)
        category = voice.get("category", "unknown")
        
        # Add category to label for clarity
        label = f"{name} ({category})"
        
        return {
            "value": voice_id,
            "label": label,
            "name": name,
            "category": category
        }
    
    def update_popup_html(self, models):
        """Update popup.html with current models."""
        popup_file = self.extension_path / "popup.html"
        
        if not popup_file.exists():
            print(f"Error: {popup_file} not found")
            return False
        
        print(f"Updating {popup_file}...")
        
        # Read the file
        with open(popup_file, 'r', encoding='utf-8') as f:
            content = f.read()
        
        # Find the model select dropdown
        select_pattern = r'(<select id="mode">[\s\S]*?</select>)'
        match = re.search(select_pattern, content)
        
        if not match:
            print("Error: Could not find model select dropdown in popup.html")
            return False
        
        old_select = match.group(1)
        
        # Build new select options
        options_html = []
        for model in models:
            formatted = self.format_model_for_dropdown(model)
            option = f'  <option value="{formatted["value"]}">{formatted["name"]}</option>'
            options_html.append(option)
        
        new_select = f'<select id="mode">\n' + '\n'.join(options_html) + '\n</select>'
        
        # Replace in content
        content = content.replace(old_select, new_select)
        
        # Write back
        with open(popup_file, 'w', encoding='utf-8') as f:
            f.write(content)
        
        print(f"Updated {popup_file} with {len(models)} models")
        return True
    
    def update_content_js_model_mapping(self, models):
        """Update the model mapping logic in content.js."""
        content_file = self.extension_path / "content.js"
        
        if not content_file.exists():
            print(f"Error: {content_file} not found")
            return False
        
        print(f"Updating {content_file}...")
        
        # Read the file
        with open(content_file, 'r', encoding='utf-8') as f:
            content = f.read()
        
        # Find the model mapping section (around line 40-50)
        # Look for the const model_id = ... pattern
        pattern = r'(const model_id =\s*[\s\S]*?\n)'
        match = re.search(pattern, content)
        
        if not match:
            print("Error: Could not find model mapping in content.js")
            return False
        
        # Build new model mapping logic
        mapping_lines = []
        mapping_lines.append("  const model_id =")
        
        # Add mappings for each model
        for i, model in enumerate(models):
            model_id = model.get("model_id", "")
            model_name = model.get("name", "").lower().replace(" ", "_")
            
            # Create condition
            condition = f"    (mode === \"{model_name}\" || mode === \"{model_id}\") ? \"{model_id}\" :"
            
            # For the last model, make it the default
            if i == len(models) - 1:
                condition = f"    \"{model_id}\"; // default"
            
            mapping_lines.append(condition)
        
        new_mapping = '\n'.join(mapping_lines)
        
        # Replace in content
        content = re.sub(pattern, new_mapping + '\n', content)
        
        # Write back
        with open(content_file, 'w', encoding='utf-8') as f:
            f.write(content)
        
        print(f"Updated model mapping in {content_file}")
        return True
    
    def create_models_json(self, models):
        """Create a JSON file with model information for reference."""
        models_file = self.extension_path / "models.json"
        
        formatted_models = []
        for model in models:
            formatted = {
                "model_id": model.get("model_id"),
                "name": model.get("name"),
                "description": model.get("description"),
                "can_be_finetuned": model.get("can_be_finetuned", False),
                "token_cost_factor": model.get("token_cost_factor", 1.0),
                "languages": model.get("languages", []),
                "can_do_text_to_speech": model.get("can_do_text_to_speech", False),
                "can_do_voice_conversion": model.get("can_do_voice_conversion", False)
            }
            formatted_models.append(formatted)
        
        with open(models_file, 'w', encoding='utf-8') as f:
            json.dump(formatted_models, f, indent=2)
        
        print(f"Created {models_file} with model information")
        return True
    
    def create_voices_json(self, voices):
        """Create a JSON file with voice information for reference."""
        voices_file = self.extension_path / "voices.json"
        
        formatted_voices = []
        for voice in voices:
            formatted = {
                "voice_id": voice.get("voice_id"),
                "name": voice.get("name"),
                "category": voice.get("category"),
                "description": voice.get("description", ""),
                "labels": voice.get("labels", {}),
                "preview_url": voice.get("preview_url", ""),
                "available_for_tiers": voice.get("available_for_tiers", []),
                "settings": voice.get("settings", {})
            }
            formatted_voices.append(formatted)
        
        with open(voices_file, 'w', encoding='utf-8') as f:
            json.dump(formatted_voices, f, indent=2)
        
        print(f"Created {voices_file} with voice information")
        return True
    
    def update_manifest_version(self):
        """Update the manifest.json version (optional)."""
        manifest_file = self.extension_path / "manifest.json"
        
        if not manifest_file.exists():
            print("Note: manifest.json not found, skipping version update")
            return False
        
        try:
            with open(manifest_file, 'r', encoding='utf-8') as f:
                manifest = json.load(f)
            
            # Increment version (simple patch version increment)
            current_version = manifest.get("version", "1.0.0")
            parts = current_version.split(".")
            if len(parts) == 3:
                patch = int(parts[2]) + 1
                new_version = f"{parts[0]}.{parts[1]}.{patch}"
                manifest["version"] = new_version
                
                with open(manifest_file, 'w', encoding='utf-8') as f:
                    json.dump(manifest, f, indent=2)
                
                print(f"Updated manifest version from {current_version} to {new_version}")
                return True
        except Exception as e:
            print(f"Error updating manifest: {e}")
        
        return False
    
    def create_update_report(self, models, voices, subscription):
        """Create a report of what was updated."""
        import datetime
        report_file = self.extension_path / "update_report.txt"
        
        with open(report_file, 'w', encoding='utf-8') as f:
            f.write("=== ElevenLabs Extension Update Report ===\n\n")
            f.write(f"Date: {datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
            f.write(f"Models found: {len(models)}\n")
            f.write(f"Voices found: {len(voices)}\n\n")
            
            f.write("=== Available Models ===\n")
            for model in models:
                f.write(f"- {model.get('name')} ({model.get('model_id')})\n")
                f.write(f"  Description: {model.get('description', 'N/A')}\n")
                f.write( "  Languages: " + ', '.join(f"{item['language_id']}: {item['name']}" for item in model.get('languages', [])))
                f.write(f"  Token cost: {model.get('token_cost_factor', 1.0)}x\n\n")
            
            f.write("\n=== Subscription Info ===\n")
            if subscription:
                f.write(f"Tier: {subscription.get('tier', 'N/A')}\n")
                f.write(f"Character limit: {subscription.get('character_limit', 'N/A')}\n")
                f.write(f"Character count: {subscription.get('character_count', 'N/A')}\n")
                f.write(f"Can use instant voice cloning: {subscription.get('can_use_instant_voice_cloning', False)}\n")
                f.write(f"Can use professional voice cloning: {subscription.get('can_use_professional_voice_cloning', False)}\n")
        
        print(f"Created update report: {report_file}")
        return True
    
    def run_update(self):
        """Run the complete update process."""
        print("=" * 60)
        print("ElevenLabs Chrome Extension Updater")
        print("=" * 60)
        
        # Fetch data from API
        models = self.fetch_models()
        voices = self.fetch_voices()
        subscription = self.get_user_subscription()
        
        if not models:
            print("No models found. Update aborted.")
            return False
        
        # Update files
        success = True
        
        # Update popup.html with models
        if not self.update_popup_html(models):
            success = False
        
        # Update content.js model mapping
        if not self.update_content_js_model_mapping(models):
            success = False
        
        # Create JSON files for reference
        self.create_models_json(models)
        self.create_voices_json(voices)
        
        # Update manifest version
        self.update_manifest_version()
        
        # Create update report
        self.create_update_report(models, voices, subscription)
        
        if success:
            print("\n" + "=" * 60)
            print("UPDATE COMPLETE!")
            print("=" * 60)
            print("\nNext steps:")
            print("1. Load the updated extension in Chrome:")
            print("   - Go to chrome://extensions/")
            print("   - Enable 'Developer mode'")
            print("   - Click 'Load unpacked'")
            print("   - Select the extension directory")
            print("\n2. Test the extension with the new models")
            print("\n3. Check update_report.txt for details")
        else:
            print("\nUpdate completed with some errors. Check the output above.")
        
        return success


def main():
    """Main function with user interaction."""
    import sys
    
    print("ElevenLabs Chrome Extension Updater")
    print("-" * 40)
    
    # Get API key
    api_key = getpass("Enter your ElevenLabs API key: ").strip()
    print(len(api_key), api_key[-4:])
    if not api_key:
        print("Error: API key is required")
        sys.exit(1)
    
    # Get extension path
    default_path = input(f"Enter extension path [default: current directory]: ").strip()
    extension_path = default_path if default_path else "."
    
    # Create updater and run
    updater = ElevenLabsExtensionUpdater(api_key, extension_path)
    updater.run_update()


if __name__ == "__main__":
    # You can also run this directly with command line arguments
    import argparse
    
    parser = argparse.ArgumentParser(description="Update ElevenLabs Chrome Extension")
    parser.add_argument("--api-key", help="ElevenLabs API key")
    parser.add_argument("--path", default=".", help="Extension directory path")
    parser.add_argument("--auto", action="store_true", help="Run without prompts")
    
    args = parser.parse_args()
    
    if args.api_key:
        # Run with command line arguments
        updater = ElevenLabsExtensionUpdater(args.api_key, args.path)
        updater.run_update()
    else:
        # Run with interactive prompts
        main()
