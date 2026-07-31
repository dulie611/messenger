const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");
const app = express();
const server = http.createServer(app);
const io = new Server(server);
const messengerdb = require("./messengerdb");

// AC-02.6 (Security): CSP header - browser-level defense-in-depth
app.use((req, res, next) => {
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; " +
      "script-src 'self' https://cdnjs.cloudflare.com https://code.jquery.com https://cdn.jsdelivr.net https://stackpath.bootstrapcdn.com; " +
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.jsdelivr.net https://stackpath.bootstrapcdn.com;" +
      "connect-src 'self' https://cdnjs.cloudflare.com https://cdn.jsdelivr.net;" +
      "font-src 'self' https://fonts.gstatic.com https://stackpath.bootstrapcdn.com",
  );
  next();
});

app.use(express.static(path.join(__dirname, "ui")));

const PORT = process.env.PORT || 8080;
// server.listen(PORT, () => console.log('Server running on port ' + PORT)); before mongodb integration

(async () => {
  try {
    await messengerdb.connect();

    server.listen(PORT, () => console.log("Server running on port " + PORT));
  } catch (err) {
    console.log(
      "Error>server.js: failed to start - database connection error",
      err,
    );
    process.exit(1); // Fail fast — don't run a server that can't authenticate anyone.
  }
})();

// In-memory store: socketId → username
const userlist = new Map();
const groups = new Map(); // groupName: Set of usernames

// =============================================================
// Use-Case-04: Authorize User
// returns true if this connection was authenticated by Use-Case-03
// =============================================================
function authorizeUser(socket) {
  if (!socket || !socket.authenticated)
    console.log("Connection has not been authenticated");
  return socket.authenticated === true;
}

// =============================================================
// Helper: send an event only to authenticated connections
// Used by Use-Case-01 (Send Message) and Use-Case-03 (Join Chat)
// =============================================================
function sendToAuthenticatedClients(event, data) {
  userlist.forEach((_, sid) => {
    const s = io.sockets.sockets.get(sid);
    if (s && authorizeUser(s)) s.emit(event, data);
  });
}

function getGroupMembers(groupName) {
  if (!groups.has(groupName)) {
    groups.set(groupName, new Set());
  }

  return groups.get(groupName);
}

function broadcastGroupList(groupName) {
  const members = getGroupMembers(groupName);

  io.to(groupName).emit("group-user-list", {
    groupName: groupName,
    users: Array.from(members),
  });
}

function removeUserFromCurrentGroup(socket) {
  if (!socket.currentGroup) return;

  const groupName = socket.currentGroup;
  const username = userlist.get(socket.id);

  socket.leave(groupName);

  if (groups.has(groupName) && username) {
    groups.get(groupName).delete(username);

    if (groups.get(groupName).size === 0) {
      groups.delete(groupName);
    } else {
      io.to(groupName).emit(
        "group-status",
        username + " left group " + groupName,
      );

      broadcastGroupList(groupName);
    }
  }

  socket.currentGroup = null;
}

function sendToAuthenticatedClientsExcept(excludedSocketId, event, data) {
  userlist.forEach((_, sid) => {
    if (sid === excludedSocketId) return;

    const s = io.sockets.sockets.get(sid);
    if (s && authorizeUser(s)) {
      s.emit(event, data);
    }
  });
}

function findSocketIdByUsername(username) {
  for (const [socketId, storedUsername] of userlist.entries()) {
    if (storedUsername === username) {
      return socketId;
    }
  }

  return null;
}

io.on("connection", (socket) => {
  socket.authenticated = false;

  // ---------------------------------------------------------------------------
  // Use-Case-03: Join Chat
  // ---------------------------------------------------------------------------
  socket.on("join-chat", async (data) => {
    if (
      !data ||
      typeof data.username !== "string" ||
      typeof data.password !== "string"
    ) {
      socket.emit("join-error", "Invalid username or password");
      return;
    }

    const username = data.username.trim();
    const password = data.password;
    const user = await messengerdb.find(username, password);

    if (!user) {
      socket.emit("join-error", "Invalid username or password");
      return;
    }

    socket.authenticated = true;
    userlist.set(socket.id, username);
    io.emit("user-list", Array.from(userlist.values()));
    console.log("New client connected - socket ID: " + socket.id);
    socket.emit("join-success", username);
    sendToAuthenticatedClients(
      "status",
      username +
        " joined the chat. Number of connected clients: " +
        userlist.size,
    );

    var chat_history = await messengerdb.loadChatHistory();
    if (chat_history && chat_history.length > 0) {
      chat_history = chat_history.reverse();
      socket.emit("chat_history", chat_history);
    }
  });

  // ---------------------------------------------------------------------------
  // Use-Case-01: Send message
  //
  // AC-01.1: a username is assigned after Join Chat — every sender
  //          is identified before any message can be sent
  // AC-01.2: empty or non-string messages are ignored — no broadcast is sent
  // AC-01.3: the message is broadcast to ALL authenticated clients
  // AC-01.4: the broadcast payload includes the sender's username and the text
  // AC-01.5: input is cleared after sending (enforced client-side)
  // ---------------------------------------------------------------------------
  //Todo: code to implement the above use case and AC items
  socket.on("message", async (data) => {
    console.log(`Debug> received a chat message: ${data}`); //new debug for Lab 2 security check
    // <<include>> UC-04: Authorize User
    if (!authorizeUser(socket)) {
      socket.emit("not-authorized");
      return;
    }
    // AC-01.2: ignore empty messages
    if (!data || data.trim() === "") return;
    // AC-01.3 + AC-01.4: revised: broadcast to all authenticated clients with sender username
    const sender = userlist.get(socket.id);
    console.log(`Debug> "${sender}" sent: ${data}`);
    //io.emit('message', sender + ' says: ' + data.trim()); //old code in Lab 1 sent to all connected clients
    formatted_data = data.trim();

    const chat = await messengerdb.storePublicChat(sender, formatted_data);
    sendToAuthenticatedClients("message", chat); // new code for Lab 2
  });

  // ---------------------------------------------------------------------------
  // (F1.5): Private Messaging
  // ---------------------------------------------------------------------------
  socket.on("private-message", (data) => {
    if (!authorizeUser(socket)) {
      socket.emit("not-authorized");
      return;
    }

    if (
      !data ||
      typeof data.to !== "string" ||
      typeof data.text !== "string" ||
      data.to.trim() === "" ||
      data.text.trim() === ""
    ) {
      socket.emit(
        "private-message-error",
        "Recipient and message are required.",
      );
      return;
    }

    const sender = userlist.get(socket.id);
    const recipient = data.to.trim();
    const text = data.text.trim();

    const targetSocketId = findSocketIdByUsername(recipient);

    if (!targetSocketId) {
      socket.emit("private-message-error", "User is not online.");
      return;
    }

    const privateMessage = {
      from: sender,
      to: recipient,
      text: text,
      timestamp: new Date().toISOString(),
    };

    // Send to recipient
    io.to(targetSocketId).emit("private-message", privateMessage);

    // Also show sender their own private message
    socket.emit("private-message", privateMessage);
  });

  socket.on("get-user-profile", async (username) => {
    if (!authorizeUser(socket)) {
      socket.emit("not-authorized");
      return;
    }

    if (typeof username !== "string" || username.trim() === "") {
      socket.emit("user-profile-error", "User profile is unavailable.");
      return;
    }

    const requestedUsername = username.trim();

    if (!Array.from(userlist.values()).includes(requestedUsername)) {
      socket.emit("user-profile-error", "User is not online.");
      return;
    }

    try {
      const profile = await messengerdb.getPublicProfile(requestedUsername);

      if (!profile) {
        socket.emit("user-profile-error", "User profile is unavailable.");
        return;
      }

      socket.emit("user-profile", profile);
    } catch (err) {
      socket.emit("user-profile-error", "User profile is unavailable.");
    }
  });

  // ---------------------------------------------------------------------------
  // Group Messaging
  // ---------------------------------------------------------------------------

  socket.on("join-group", function (data) {
    if (!authorizeUser(socket)) {
      socket.emit("not-authorized");
      return;
    }

    if (!data || typeof data.groupName !== "string") {
      socket.emit("group-error", "Group name is required.");
      return;
    }

    const groupName = data.groupName.trim();

    if (!groupName) {
      socket.emit("group-error", "Group name cannot be empty.");
      return;
    }

    const username = userlist.get(socket.id);

    // Bare-bones version: one active group at a time, will change later in future sprints
    removeUserFromCurrentGroup(socket);

    socket.join(groupName);
    socket.currentGroup = groupName;

    const members = getGroupMembers(groupName);
    members.add(username);

    socket.emit("group-joined", {
      groupName: groupName,
      users: Array.from(members),
    });

    io.to(groupName).emit(
      "group-status",
      username + " joined group " + groupName,
    );

    broadcastGroupList(groupName);
  });

  socket.on("leave-group", function () {
    if (!authorizeUser(socket)) {
      socket.emit("not-authorized");
      return;
    }

    const oldGroup = socket.currentGroup;

    removeUserFromCurrentGroup(socket);

    socket.emit("group-left", oldGroup);
  });

  socket.on("group-message", function (data) {
    if (!authorizeUser(socket)) {
      socket.emit("not-authorized");
      return;
    }

    if (
      !data ||
      typeof data.groupName !== "string" ||
      typeof data.text !== "string"
    ) {
      socket.emit("group-error", "Group name and message are required.");
      return;
    }

    const groupName = data.groupName.trim();
    const text = data.text.trim();

    if (!groupName || !text) {
      socket.emit("group-error", "Group name and message are required.");
      return;
    }

    if (socket.currentGroup !== groupName) {
      socket.emit(
        "group-error",
        "You must join this group before sending messages.",
      );
      return;
    }

    const sender = userlist.get(socket.id);

    const groupMessage = {
      groupName: groupName,
      sender: sender,
      text: text,
      timestamp: new Date().toISOString(),
    };

    io.to(groupName).emit("group-message", groupMessage);
  });

  socket.on("delete-message", async (id) => {
    const sender = userlist.get(socket.id);
    const message = await messengerdb.deleteMsg(id, sender);
    sendToAuthenticatedClients("message-delete", message);
  });
  // ---------------------------------------------------------------------------
  // Typing Status Indicator - Public Chat
  // ---------------------------------------------------------------------------
  socket.on("public-typing", () => {
    if (!authorizeUser(socket)) {
      socket.emit("not-authorized");
      return;
    }

    const username = userlist.get(socket.id);
    if (!username) return;

    sendToAuthenticatedClientsExcept(socket.id, "public-typing", username);
  });

  socket.on("public-stop-typing", () => {
    if (!authorizeUser(socket)) return;

    const username = userlist.get(socket.id);
    if (!username) return;

    sendToAuthenticatedClientsExcept(socket.id, "public-stop-typing", username);
  });

  // ---------------------------------------------------------------------------
  // Typing Status Indicator - Private Chat
  // ---------------------------------------------------------------------------
  socket.on("private-typing", (data) => {
    if (!authorizeUser(socket)) {
      socket.emit("not-authorized");
      return;
    }

    if (!data || typeof data.to !== "string") return;

    const sender = userlist.get(socket.id);
    const targetSocketId = findSocketIdByUsername(data.to.trim());

    if (sender && targetSocketId) {
      io.to(targetSocketId).emit("private-typing", sender);
    }
  });

  socket.on("private-stop-typing", (data) => {
    if (!authorizeUser(socket)) return;

    if (!data || typeof data.to !== "string") return;

    const sender = userlist.get(socket.id);
    const targetSocketId = findSocketIdByUsername(data.to.trim());

    if (sender && targetSocketId) {
      io.to(targetSocketId).emit("private-stop-typing", sender);
    }
  });
  // ---------------------------------------------------------------------------
  // Use-Case-02: Receive message — disconnect notification
  //
  // AC-02.2: all connected clients are notified when a user leaves
  // ---------------------------------------------------------------------------
  socket.on("disconnect", () => {
    removeUserFromCurrentGroup(socket);

    const username = userlist.get(socket.id);
    userlist.delete(socket.id);
    io.emit("user-list", Array.from(userlist.values()));
    console.log("Client disconnected - socket ID: " + socket.id);
    //todo: code to broadcast the status
    if (username)
      sendToAuthenticatedClients(
        "status",
        username +
          " left the chat. Number of connected clients: " +
          userlist.size,
      );
  });

  // Use-Case-05: Register Account
  socket.on(
    "register",
    async function ({ username, password, email, fullName }) {
      if (
        !username ||
        typeof username !== "string" ||
        !password ||
        typeof password !== "string" ||
        !email ||
        typeof email !== "string" ||
        !fullName ||
        typeof fullName !== "string" ||
        username.trim().length === 0 ||
        password.length === 0 ||
        email.trim().length === 0 ||
        fullName.trim().length === 0
      ) {
        // AC-05.3
        socket.emit("register-error", "Invalid request."); // AC-05.8
        return;
      }
      username = username.trim();
      email = email.trim();
      fullName = fullName.trim();

      // AC-05.3: server independently re-validates format - client can be bypassed
      const usernamePattern = /^\w{3,20}$/;
      const passwordPattern = /^(?=.*[A-Za-z])(?=.*\d).{6,}$/;
      const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!usernamePattern.test(username)) {
        socket.emit(
          "register-error",
          "Username must be 3-20 characters (letters, numbers, underscore).",
        );
        return; // AC-05.8
      }
      if (!passwordPattern.test(password)) {
        socket.emit(
          "register-error",
          "Password must be at least 6 characters with letters and numbers.",
        );
        return; // AC-05.8
      }
      if (!emailPattern.test(email)) {
        socket.emit("register-error", "Please enter a valid email address.");
        return;
      }

      let result;
      try {
        result = await messengerdb.register(
          username,
          password,
          email,
          fullName,
        );
      } catch (err) {
        socket.emit("register-error", "Server error. Please try again."); // AC-05.8
        return;
      }

      if (!result.success) {
        socket.emit("register-error", result.message); // AC-05.8
        return;
      }
      socket.emit("register-success", username); // AC-05.7: send the 'register-success' event to the client
    },
  );
  socket.on(
    "edit-profile",
    async function ({ oldPassword, newPassword, newEmail, newFullName }) {
      if (!authorizeUser(socket)) {
        socket.emit("edit-profile-error", "Please log in first.");
        return;
      }

      const username = userlist.get(socket.id);

      if (!oldPassword || typeof oldPassword !== "string") {
        socket.emit("edit-profile-error", "Current password is required.");
        return;
      }

      // newPassword, newEmail, newFullName are all optional - user can update any combination
      let result;
      try {
        result = await messengerdb.editProfile(
          username,
          oldPassword,
          newPassword || null,
          newEmail || null,
          newFullName || null,
        );
      } catch (err) {
        socket.emit("edit-profile-error", "Server error. Please try again.");
        return;
      }

      if (!result.success) {
        socket.emit("edit-profile-error", result.message);
        return;
      }

      socket.emit("edit-profile-success");
    },
  );
  // Use-Case: Logout - only logged in users can log out
  socket.on("logout", () => {
    if (!authorizeUser(socket)) return;

    removeUserFromCurrentGroup(socket);

    const username = userlist.get(socket.id);
    socket.authenticated = false;
    userlist.delete(socket.id);
    io.emit("user-list", Array.from(userlist.values()));
    if (username)
      sendToAuthenticatedClients(
        "status",
        username +
          " left the chat. Number of connected clients: " +
          userlist.size,
      );
    socket.emit("logout-success");
  });
});
