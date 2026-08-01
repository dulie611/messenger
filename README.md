# Real-Time Messenger

A full-stack real-time messaging application built with JavaScript, Node.js, Express, Socket.IO, and MongoDB. Users can create accounts, log in securely, communicate through public, private, and group chats, view online users, manage their account information, and receive live typing and status updates without refreshing the page.

This project also demonstrates how JavaScript can support several programming paradigms in one application, including event-driven, imperative, functional-style, asynchronous, and modular programming.

## Key Features

### User accounts and authentication

- Register with a username, password, email address, and full name.
- Log in using stored account credentials.
- Validate registration data in the browser, server, and database layers.
- Store passwords as bcrypt hashes rather than plaintext.
- Restrict chat actions to authenticated socket connections.
- Log out without restarting the server.

### Public chat

- Send messages to every authenticated user currently connected.
- Display the sender and timestamp for each message.
- Store public messages in MongoDB.
- Load recent public chat history after login.
- Delete a public message only when the logged-in user originally sent it.
- Replace deleted content with a deletion notice.
- Automatically scroll to the newest message.

### Private chat

- Send a message directly to a selected online user.
- Display private messages to both the sender and recipient.
- Report an error when the recipient is not online.
- Show a real-time private typing indicator to the intended recipient.

### Group chat

- Join a named chat group.
- View the current members of the group.
- Send messages only to users in the same group.
- Leave the current group.
- Receive group join and leave notifications.
- Maintain one active group per socket connection.

### Presence and profile features

- Display a live list of connected users.
- Show join and disconnect status messages.
- Open a public profile for an online user.
- Display the user's full name and email address.
- Update a password, email address, or full name from the account-management page.

### User-interface features

- Separate login, registration, chat, and account-management views.
- Responsive public, private, and group chat panels.
- Link insertion support for chat messages.
- Keyboard submission with the Enter key.
- Public and private typing indicators.
- Consistent visual styling across forms and chat panels.

## Technologies

- **JavaScript** for client-side and server-side logic
- **Node.js** for the server runtime
- **Express** for serving the web application
- **Socket.IO** for bidirectional real-time communication
- **MongoDB** for users and public-message history
- **bcrypt** for password hashing and verification
- **dotenv** for environment-variable configuration
- **HTML and CSS** for the user interface
- **Bootstrap, Font Awesome, and jQuery** for selected interface behavior and styling

## Project Structure

```text
messenger-project/
├── server.js
├── messengerdb.js
├── package.json
├── .env
└── ui/
    ├── index.html
    ├── client.js
    └── styles.css
```

The server uses `express.static()` to serve files from the `ui` directory. Place the browser files inside that directory.

## Installation and Setup

### 1. Install Node.js

Install a current Node.js release that includes npm.

### 2. Install the dependencies

From the project root, run:

```bash
npm init -y
npm install express socket.io mongodb bcrypt dotenv
```

### 3. Configure MongoDB

Create a `.env` file in the project root:

```env
MONGO_URI=your_mongodb_connection_string
PORT=8080
```

`PORT` is optional. The application uses port `8080` when no environment value is provided.

The database module uses the following MongoDB database and collections:

```text
Database: Messenger
Collections:
- Users
- MessageHistory
```

The collections can be created automatically when the application inserts its first records.

### 4. Start the server

```bash
node server.js
```

The application connects to MongoDB before accepting requests. If the connection fails, the server exits instead of running without authentication support.

### 5. Open the application

Visit:

```text
http://localhost:8080
```

Open the application in multiple browser windows to test public, private, group, presence, and typing features.

## How the Application Works

### Client layer

`client.js` reads user input, switches between interface views, validates forms, updates the DOM, and sends or receives Socket.IO events. It handles events such as:

```text
join-chat
message
private-message
join-group
group-message
public-typing
private-typing
register
edit-profile
logout
```

### Server layer

`server.js` coordinates connected users and chat groups. It authenticates socket connections, validates incoming data, routes public/private/group messages, broadcasts presence changes, and calls the database module when persistent data is required.

Two in-memory data structures are used for active session information:

- A `Map` associates socket IDs with usernames.
- A second `Map` associates group names with sets of usernames.

### Database layer

`messengerdb.js` isolates MongoDB operations from the rest of the server. It provides functions for:

- Connecting to MongoDB
- Finding and authenticating users
- Registering accounts
- Returning public profiles
- Loading public chat history
- Storing and deleting public messages
- Updating account information

This separation keeps database responsibilities out of the Socket.IO event handlers.

## Programming Paradigms Demonstrated

JavaScript is a multi-paradigm language. This project does not use only one programming style; different parts of the system use the paradigm that best fits the problem.

### 1. Event-driven programming

Event-driven programming is the main paradigm used by the application. The program waits for user actions or network events and runs a callback when an event occurs.

Client-side examples include:

```javascript
document.getElementById("send-button").addEventListener("click", sendMessage);

socket.on("private-message", function (data) {
  // Display the incoming private message.
});
```

Server-side examples include:

```javascript
io.on("connection", function (socket) {
  socket.on("message", async function (data) {
    // Validate, store, and broadcast the message.
  });
});
```

This paradigm is appropriate because a messaging application cannot predict when a user will connect, type, send a message, join a group, or disconnect.

### 2. Imperative programming

Imperative programming appears when the code describes a sequence of commands that changes application state or the interface.

For example, sending a message follows a direct sequence:

1. Read the message from the input.
2. Remove unnecessary whitespace.
3. Reject an empty message.
4. emit a Socket.IO event.
5. Clear the input.
6. Return focus to the editor.

DOM manipulation is also imperative because the client explicitly creates elements, updates their content, appends them to the page, and scrolls the display.

### 3. Functional-style programming

The project uses functional techniques even though it is not a purely functional application.

Examples include:

- Passing functions as event callbacks
- Small helper functions with one responsibility
- Array transformations such as `Array.from()` and `forEach()`
- Returning values from validation and database functions
- Keeping repeated operations in reusable functions such as `authorizeUser()`, `findSocketIdByUsername()`, and `getGroupMembers()`

The database functions return promises and result objects instead of directly controlling the user interface. For example, registration returns either a success result or a descriptive failure result, allowing the server handler to decide what event to emit.

The application still contains mutable state, including the user and group maps, so it should be described as using **functional-style techniques**, not as a purely functional program.

### 4. Asynchronous programming

Many operations do not finish immediately. MongoDB queries, password hashing, authentication, and message persistence are asynchronous.

The project uses `async` and `await` to express these operations clearly:

```javascript
const user = await messengerdb.find(username, password);
const chat = await messengerdb.storePublicChat(sender, message);
```

Socket.IO also supports asynchronous communication because the sender and receiver operate independently. The server reacts whenever data arrives rather than blocking while waiting for a user action.

### 5. Modular and procedural programming

The project is divided into files with separate responsibilities:

- `client.js` handles browser behavior.
- `server.js` handles networking, authorization, connected users, and chat routing.
- `messengerdb.js` handles persistent data.
- `styles.css` handles presentation.
- `index.html` defines the interface structure.

Within those modules, named procedures such as `sendMessage()`, `joinGroup()`, `removeUserFromCurrentGroup()`, and `editProfile()` break large tasks into smaller operations. This improves readability, reuse, and testing.

### 6. Object-based programming

The project uses JavaScript objects to represent structured application data, including users, public messages, private messages, group messages, profiles, and update requests.

For example:

```javascript
const privateMessage = {
  from: sender,
  to: recipient,
  text: text,
  timestamp: new Date().toISOString(),
};
```

This is object-based design, but the current implementation does not rely heavily on classes, inheritance, or polymorphism. Therefore, it would be inaccurate to present the application as a primarily class-based object-oriented project.

## Examples of Paradigm Interaction

One public message passes through several paradigms:

1. **Event-driven:** A click or Enter key event calls `sendMessage()`.
2. **Imperative:** The client reads, validates, sends, clears, and refocuses the message field.
3. **Asynchronous:** The Socket.IO event travels to the server, and MongoDB stores the message asynchronously.
4. **Functional-style:** Helper and database functions receive inputs and return results.
5. **Object-based:** The stored message is represented as an object containing a sender, message, timestamp, deletion state, and database ID.
6. **Event-driven again:** The server emits the saved message, and every authenticated client handles the incoming event.

This interaction demonstrates why a multi-paradigm language is useful: each programming style handles a different part of the same feature.

## Security and Validation

The project includes several defensive measures:

- Passwords are hashed with bcrypt.
- Plaintext passwords are not stored in MongoDB.
- Authentication is checked before protected socket events are processed.
- Client input is revalidated by the server.
- Registration data is also validated in the database module.
- Type checks reduce the risk of malformed data and NoSQL-injection-style inputs.
- Public profile queries use MongoDB projections so password hashes are not returned.
- A Content Security Policy header restricts browser resource sources.
- The server fails fast if it cannot connect to the database.

Client-side validation improves usability, but server-side and database-layer validation provide the actual security boundary because browser checks can be bypassed.

## Current Design Limitations

- Active users and group membership are stored in memory and reset when the server restarts.
- A user can participate in only one active group per connection.
- Public messages are persisted, while private and group messages are not currently stored.
- The online-user lookup assumes one active socket for each username.
- The current code is primarily event-driven and procedural rather than class-based object-oriented.

These limitations also provide directions for future development.

## Possible Future Improvements

- Persist private and group-message history.
- Allow users to join multiple groups.
- Add group creation permissions and invitations.
- Add read receipts and delivery status indicators.
- Add message editing and reactions.
- Track multiple sessions for the same account.
- Add automated tests for database functions and Socket.IO handlers.
- Introduce schemas or stronger server-side sanitization for rich-text messages.
- Refactor repeated message-display logic into shared pure functions.
- Deploy the application to a cloud platform.

## Course Connection

This project demonstrates how language design affects program structure. JavaScript's first-class functions make callbacks and event handlers natural. Its object model makes structured event payloads easy to create. Promises and `async`/`await` support non-blocking database operations. Dynamic browser APIs allow direct interface updates, while Node.js permits the same language to be used on both the client and server.

The strongest paradigm demonstrated is **event-driven programming**, supported by **imperative**, **asynchronous**, **functional-style**, **modular**, and **object-based** techniques. The project therefore shows how multiple paradigms can cooperate within one practical application rather than forcing the entire system into a single style.
