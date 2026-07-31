const { MongoClient, ObjectId } = require("mongodb");
const bcrypt = require("bcrypt");

require("dotenv").config();
const uri = process.env.MONGO_URI; //replace this with your connection string
const client = new MongoClient(uri);

async function connect() {
  await client.connect();
  console.log("Debug>messengerdb.js: connected to MongoDB server!");
}

let users = client.db("Messenger").collection("Users");
let chatHistory = client.db("Messenger").collection("MessageHistory");

// Use-Case-03: Join Chat - credential check against MongoDB
const find = async (username, password) => {
  let user = null;
  console.log(`Debug>messengerdb.js: find user '${username}'`); // password log is removed
  // Data layer independently re-validates type - defense in depth,
  // same NoSQL-injection guard as register(): reject non-string input
  if (typeof username !== "string" || typeof password !== "string") return null;
  // AC-03.3: look up by username only - password is never queryable directly, it's hashed
  user = await users.findOne({ username: username });
  if (!user) return null;
  // AC-03.3: compare the plaintext attempt against the stored bcrypt hash
  const passwordMatches = await bcrypt.compare(password, user.password);
  if (!passwordMatches) return null;
  return user;
};

const getPublicProfile = async (username) => {
  if (typeof username !== "string" || username.trim().length === 0) return null;

  const user = await users.findOne(
    { username: username.trim() },
    { projection: { _id: 0, username: 1, email: 1, fullName: 1 } },
  );

  if (!user) return null;

  return {
    username: user.username,
    fullName: user.fullName || user.username,
    email: user.email || "No email on file",
  };
};

// Use-Case-05: Register Account - insert a new user if username is not taken
// returns { success: true } or { success: false, message }
const register = async (username, password, email, fullName) => {
  console.log(`Debug>messengerdb.js: register username '${username}'`);

  // AC-05.4: data layer independently re-validates format - do not trust the server
  const usernamePattern = /^\w{3,20}$/;
  const passwordPattern = /^(?=.*[A-Za-z])(?=.*\d).{6,}$/;
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!usernamePattern.test(username) || !passwordPattern.test(password))
    return { success: false, message: "Invalid username or password format." }; // AC-05.8
  if (!email || !emailPattern.test(email))
    return { success: false, message: "Invalid email format." };
  if (!fullName || fullName.trim().length === 0)
    return { success: false, message: "Full name is required." };

  // AC-05.5: check if the username already exists before inserting
  const existing = await users.findOne({ username: username });
  if (existing) return { success: false, message: "Username already exists." }; // AC-05.8

  // AC-05.6: hash the password before storing - never store plaintext
  const hashedPassword = await bcrypt.hash(password, 10);
  await users.insertOne({
    username: username,
    password: hashedPassword,
    email: email,
    fullName: fullName.trim(),
  });

  return { success: true }; // AC-05.7
};

const loadChatHistory = async (limits = 100) => {
  var chat_history = await chatHistory
    .find({})
    .sort({ timestamp: -1 })
    .limit(limits)
    .toArray();

  if (chat_history && chat_history.length > 0) return chat_history;
};

const storePublicChat = async (sender, message) => {
  console.log("DEBUG> Storing Public message to MongoDB");

  let timestamp = Date.now();
  let chat = {
    sender: sender,
    message: message,
    timestamp: timestamp,
    deleted: false,
  };

  const chat_data = await chatHistory.insertOne(chat).catch(() => {
    console.log(
      "Debug>messengerdb.storePublicChat: Error for adding '" +
        JSON.stringify(chat) +
        "'\n",
    );
  });
  chat._id = chat_data.insertedId;
  return chat;
};
const getChatId = async (id) => {
  return await chatHistory.findOne({ _id: new ObjectId(id) });
};
const deleteMsg = async (id, username) => {
  const chat = await chatHistory.findOne({ _id: new ObjectId(id) });
  // chat exists and sender is the person deleting
  if (chat && chat.sender === username) {
    await chatHistory.updateOne(
      { _id: new ObjectId(id) },
      { $set: { message: "This message was deleted", deleted: true } },
    );
  }
  return await chat;
};

const editProfile = async (
  username,
  oldPassword,
  newPassword,
  newEmail,
  newFullName,
) => {
  console.log(`Debug>messengerdb.js: edit profile request for '${username}'`);

  const user = await users.findOne({ username: username });
  if (!user) return { success: false, message: "User not found." };

  const oldPasswordMatches = await bcrypt.compare(oldPassword, user.password);
  if (!oldPasswordMatches)
    return { success: false, message: "Current password is incorrect." };

  const updates = {};

  // Only update password if a new one was provided
  if (newPassword) {
    const passwordPattern = /^(?=.*[A-Za-z])(?=.*\d).{6,}$/;
    if (!passwordPattern.test(newPassword))
      return {
        success: false,
        message:
          "New password must be at least 6 characters with letters and numbers.",
      };
    updates.password = await bcrypt.hash(newPassword, 10);
  }

  // Only update email if a new one was provided
  if (newEmail) {
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailPattern.test(newEmail))
      return { success: false, message: "Invalid email format." };
    updates.email = newEmail;
  }

  // Only update full name if a new one was provided
  if (newFullName) {
    updates.fullName = newFullName.trim();
  }

  if (Object.keys(updates).length === 0)
    return { success: false, message: "Nothing to update." };

  await users.updateOne({ username: username }, { $set: updates });
  return { success: true };
};
module.exports = {
  connect,
  find,
  getPublicProfile,
  register,
  loadChatHistory,
  storePublicChat,
  getChatId,
  deleteMsg,
  editProfile,
};
