# Gallery Bond

Native Android app + Node backend to connect two phones and merge their photos into one shared gallery room.

## Project structure

- `server.js` and `package.json`: backend server.
- `android-app/`: Android Studio project (Kotlin).
- `public/`: optional web client (kept for quick browser testing).

## 1) Start backend server

1. Install Node.js 18+.
2. Install dependencies in this folder:

```bash
npm install
```

3. Run the server:

```bash
npm start
```

4. Server runs on `http://localhost:3000`.

## 2) Run Android app

1. Open `android-app/` in Android Studio.
2. Let Gradle sync complete.
3. Run the app on both Android phones.

## 3) Connect both phones

1. Make sure both phones and server computer are on the same Wi-Fi.
2. Find your computer LAN IP (example `192.168.1.20`).
3. In both apps, set server URL to `http://YOUR_LAN_IP:3000`.
4. Enter same room code on both phones.
5. Tap `Connect Room`.
6. Tap `Pick Photos`, then `Upload Selected`.
7. Both phones will show the shared gallery.

## Notes

- Room capacity is 2 phones.
- Photos are in-memory only (cleared when backend restarts).
- Android app uses cleartext HTTP for LAN testing (`usesCleartextTraffic=true`).
