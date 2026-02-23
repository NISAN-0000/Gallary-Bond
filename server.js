const express = require("express");
const http = require("http");
const path = require("path");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  maxHttpBufferSize: 1e7
});

const PORT = process.env.PORT || 3000;
const rooms = new Map();
const DEVICE_TTL_MS = 60 * 1000;

app.use(express.json({ limit: "12mb" }));
app.use(express.static(path.join(__dirname, "public")));

function ensureRoom(roomId) {
  if (!rooms.has(roomId)) {
    rooms.set(roomId, {
      clients: new Set(),
      devices: new Map(),
      photos: []
    });
  }
  return rooms.get(roomId);
}

function normalizeRoomId(rawRoomId) {
  const roomId = String(rawRoomId || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .slice(0, 30);
  return roomId || null;
}

function pruneDevices(room) {
  const now = Date.now();
  for (const [deviceId, device] of room.devices.entries()) {
    if (now - device.lastSeen > DEVICE_TTL_MS) {
      room.devices.delete(deviceId);
    }
  }
}

function memberCount(room) {
  pruneDevices(room);
  return room.clients.size + room.devices.size;
}

function addPhoto(room, from, dataUrl, fileName, takenAt) {
  const photo = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    dataUrl,
    fileName: fileName || "photo",
    takenAt: takenAt || new Date().toISOString(),
    from: from || "Phone"
  };

  room.photos.unshift(photo);
  room.photos = room.photos.slice(0, 200);
  return photo;
}

app.post("/api/join", (req, res) => {
  const roomId = normalizeRoomId(req.body?.roomId);
  const deviceId = String(req.body?.deviceId || "").trim();
  const deviceName = String(req.body?.deviceName || "Android Phone").trim().slice(0, 30);

  if (!roomId || !deviceId) {
    return res.status(400).json({ error: "roomId and deviceId are required" });
  }

  const room = ensureRoom(roomId);
  pruneDevices(room);

  if (!room.devices.has(deviceId) && memberCount(room) >= 2) {
    return res.status(409).json({ error: "Room is full (max 2 phones)." });
  }

  room.devices.set(deviceId, {
    name: deviceName || "Android Phone",
    lastSeen: Date.now()
  });

  return res.json({
    ok: true,
    roomId,
    members: memberCount(room),
    photos: room.photos
  });
});

app.get("/api/rooms/:roomId/state", (req, res) => {
  const roomId = normalizeRoomId(req.params.roomId);
  const deviceId = String(req.query.deviceId || "").trim();
  if (!roomId) {
    return res.status(400).json({ error: "invalid roomId" });
  }

  const room = rooms.get(roomId);
  if (!room) {
    return res.json({
      roomId,
      members: 0,
      photos: []
    });
  }

  if (deviceId && room.devices.has(deviceId)) {
    const device = room.devices.get(deviceId);
    device.lastSeen = Date.now();
  }

  return res.json({
    roomId,
    members: memberCount(room),
    photos: room.photos
  });
});

app.post("/api/rooms/:roomId/photos", (req, res) => {
  const roomId = normalizeRoomId(req.params.roomId);
  const deviceId = String(req.body?.deviceId || "").trim();
  const deviceName = String(req.body?.deviceName || "Android Phone").trim().slice(0, 30);
  const dataUrl = req.body?.dataUrl;
  const fileName = String(req.body?.fileName || "photo");
  const takenAt = req.body?.takenAt;

  if (!roomId || !deviceId || !dataUrl) {
    return res.status(400).json({ error: "roomId, deviceId and dataUrl are required" });
  }

  if (typeof dataUrl !== "string" || !dataUrl.startsWith("data:image/")) {
    return res.status(400).json({ error: "dataUrl must be an image data URL" });
  }

  const room = ensureRoom(roomId);
  pruneDevices(room);

  if (!room.devices.has(deviceId) && memberCount(room) >= 2) {
    return res.status(409).json({ error: "Room is full (max 2 phones)." });
  }

  room.devices.set(deviceId, {
    name: deviceName || "Android Phone",
    lastSeen: Date.now()
  });

  const photo = addPhoto(room, deviceName, dataUrl, fileName, takenAt);
  io.to(roomId).emit("new-photo", photo);
  return res.status(201).json({ ok: true, photo });
});

io.on("connection", (socket) => {
  socket.on("join-room", ({ roomId, deviceName }) => {
    roomId = normalizeRoomId(roomId);
    if (!roomId) return;

    const room = ensureRoom(roomId);
    if (memberCount(room) >= 2) {
      socket.emit("room-full");
      return;
    }

    socket.data.roomId = roomId;
    socket.data.deviceName = deviceName || "Phone";

    room.clients.add(socket.id);
    socket.join(roomId);

    socket.emit("room-state", {
      roomId,
      members: memberCount(room),
      photos: room.photos
    });

    socket.to(roomId).emit("peer-joined", {
      deviceName: socket.data.deviceName
    });

    io.to(roomId).emit("members-updated", { members: memberCount(room) });
  });

  socket.on("upload-photo", ({ dataUrl, fileName, takenAt }) => {
    const roomId = socket.data.roomId;
    if (!roomId || !dataUrl) return;

    const room = rooms.get(roomId);
    if (!room) return;

    const photo = addPhoto(room, socket.data.deviceName || "Phone", dataUrl, fileName, takenAt);
    io.to(roomId).emit("new-photo", photo);
  });

  socket.on("disconnect", () => {
    const roomId = socket.data.roomId;
    if (!roomId) return;

    const room = rooms.get(roomId);
    if (!room) return;

    room.clients.delete(socket.id);
    if (memberCount(room) === 0) {
      rooms.delete(roomId);
      return;
    }

    io.to(roomId).emit("members-updated", { members: memberCount(room) });
  });
});

server.listen(PORT, () => {
  console.log(`Gallery Bond running on http://localhost:${PORT}`);
});
