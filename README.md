# Endstate Matrix — Wuthering Waves Team Manager

A team building manager for Wuthering Waves.  
https://wuwa-team-manager.vercel.app/

## How to use

- Press **spacebar** to input your team, or **drag and drop**!
- **Missing a character?** Use the upload button to select a folder with `.png` icon files — name them whatever you like!
- **Account:** Click the person icon → Register with a username, email, and password. Confirm your email, then log in.
- **Cloud sync:** Once logged in, hit the cloud button next to Save to upload your data. Your saves are stored per-account and load automatically on login.
- **Custom icons:** You can upload up to **10 custom `.png` icons** (50KB max each). They're stored in your save data and synced to the cloud. Hover over a custom icon in the roster and click × to delete it.

> **Disclaimer**: This project was entirely vibe-coded. If you run into any issues, please let me know!

## Deployment

Static site — no backend required. Deploy to Vercel, Netlify, GitHub Pages, or any static host. A `vercel.json` is included for Vercel.

## File Structure

```
index.html
styles.css
script.js
characters.json
Character_Icons/
Element_Icons/
wuwa-team-manager.json
vercel.json
```
