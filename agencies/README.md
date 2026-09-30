# Agency White-Label Configuration Directory

This directory stores configuration manifests and custom branding assets for partner agencies reselling the application.

## Directory Layout

```
agencies/
  ├── agencies.json                # Master manifest of all registered agencies
  ├── default/                     # Default branding assets fallback
  └── apex_leads/                  # Example Agency Folder
        ├── ic_launcher.png        # Home screen app icon (512x512 PNG)
        └── ic_launcher_round.png  # Round app icon (512x512 PNG)
```

## How to Add a New Agency Partner

1. Open `agencies/agencies.json` and add a new entry under `"agencies"`:
```json
"my_agency": {
  "agencyId": "my_agency",
  "appName": "ClientReach Auto-Text",
  "tagline": "24/7 AI Receptionist & Inbound Lead Protection",
  "supportEmail": "support@myagency.com",
  "privacyPolicyUrl": "https://myagency.com/privacy",
  "termsUrl": "https://myagency.com/terms",
  "stripeDescriptor": "Voice Hub Network"
}
```

2. (Optional) Create a subfolder `agencies/my_agency/` and drop in `ic_launcher.png` and `ic_launcher_round.png`. If omitted, the build script will safely use the high-resolution default icons.

3. Build the branded APK:
```bash
node scripts/build_agency.js --agency my_agency
```

The compiled, signed APK will be output to `dist/agencies/my_agency/ClientReach Auto-Text.apk` with a synchronized OTA update manifest.
