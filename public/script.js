// // client-side script for WebRTC + Socket.io signaling (mesh topology for rooms)
// const socket = io(); // connect to same host by default

// // UI elements
// const joinBtn = document.getElementById('joinBtn');
// const leaveBtn = document.getElementById('leaveBtn');
// const roomIdInput = document.getElementById('roomIdInput');
// const nameInput = document.getElementById('nameInput');
// const localVideo = document.getElementById('localVideo');
// const remotesDiv = document.getElementById('remotes');
// const toggleAudioBtn = document.getElementById('toggleAudio');
// const toggleVideoBtn = document.getElementById('toggleVideo');
// const chatWindow = document.getElementById('chatWindow');
// const chatInput = document.getElementById('chatInput');
// const sendChatBtn = document.getElementById('sendChat');

// let localStream = null;
// const peers = new Map(); // targetSocketId -> RTCPeerConnection
// const remoteElements = new Map(); // targetSocketId -> video element

// const rtcConfig = {
//   iceServers: [
//     { urls: 'stun:stun.l.google.com:19302' }
//     // For production, add TURN server here
//   ]
// };

// async function startLocalStream() {
//   if (localStream) return localStream;
//   try {
//     localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
//     localVideo.srcObject = localStream;
//     return localStream;
//   } catch (err) {
//     console.error('Error accessing media devices.', err);
//     alert('Could not access camera/microphone. Check permissions.');
//   }
// }

// joinBtn.onclick = async () => {
//   const roomId = roomIdInput.value.trim();
//   if (!roomId) { alert('Enter a room ID'); return; }
//   await startLocalStream();
//   socket.emit('join-room', { roomId, userName: nameInput.value || 'Anonymous' });

//   joinBtn.disabled = true;
//   leaveBtn.disabled = false;
//   toggleAudioBtn.disabled = false;
//   toggleVideoBtn.disabled = false;
//   sendChatBtn.disabled = false;
// };

// leaveBtn.onclick = () => {
//   const roomId = roomIdInput.value.trim();
//   if (roomId) {
//     socket.emit('leave-room', { roomId });
//   }
//   cleanupAll();
//   joinBtn.disabled = false;
//   leaveBtn.disabled = true;
//   toggleAudioBtn.disabled = true;
//   toggleVideoBtn.disabled = true;
//   sendChatBtn.disabled = true;
// };

// toggleAudioBtn.onclick = () => {
//   if (!localStream) return;
//   const audioTrack = localStream.getAudioTracks()[0];
//   if (!audioTrack) return;
//   audioTrack.enabled = !audioTrack.enabled;
//   toggleAudioBtn.textContent = audioTrack.enabled ? 'Mute' : 'Unmute';
// };

// toggleVideoBtn.onclick = () => {
//   if (!localStream) return;
//   const videoTrack = localStream.getVideoTracks()[0];
//   if (!videoTrack) return;
//   videoTrack.enabled = !videoTrack.enabled;
//   toggleVideoBtn.textContent = videoTrack.enabled ? 'Camera Off' : 'Camera On';
// };

// // Chat
// sendChatBtn.onclick = sendMessage;
// chatInput.onkeydown = (e) => { if (e.key === 'Enter') sendMessage(); };

// function sendMessage() {
//   const text = chatInput.value.trim();
//   if (!text) return;
//   const roomId = roomIdInput.value.trim();
//   socket.emit('chat-message', { roomId, message: text, userName: nameInput.value || 'Anonymous' });
//   appendChat({ userName: 'You', message: text });
//   chatInput.value = '';
// }

// function appendChat({ userName, message, time }) {
//   const div = document.createElement('div');
//   const t = time ? new Date(time).toLocaleTimeString() : new Date().toLocaleTimeString();
//   div.innerHTML = `<strong>${escapeHtml(userName)}:</strong> ${escapeHtml(message)} <small style="color:#888">(${t})</small>`;
//   chatWindow.appendChild(div);
//   chatWindow.scrollTop = chatWindow.scrollHeight;
// }

// // socket handlers

// // when you join, server sends 'all-users' containing list of existing socket ids in the room
// socket.on('all-users', async (otherSocketIds) => {
//   // create peer connections (we will be offerer)
//   for (const id of otherSocketIds) {
//     await createPeerConnection(id, true);
//   }
// });

// // when another user joins while you are in the room
// socket.on('user-joined', async ({ socketId, userName }) => {
//   console.log('User joined', socketId, userName);
//   // create peer connection as offerer to the new user
//   await createPeerConnection(socketId, true);
// });

// // when a user leaves
// socket.on('user-left', ({ socketId }) => {
//   console.log('user left', socketId);
//   closePeerConnection(socketId);
// });

// // signaling: offer received
// socket.on('offer', async ({ sdp, from }) => {
//   console.log('offer from', from);
//   // create pc (answerer)
//   await createPeerConnection(from, false);
//   const pc = peers.get(from);
//   try {
//     await pc.setRemoteDescription(new RTCSessionDescription(sdp));
//     const answer = await pc.createAnswer();
//     await pc.setLocalDescription(answer);
//     socket.emit('answer', { target: from, sdp: pc.localDescription, from: socket.id });
//   } catch (err) {
//     console.error('Error handling offer', err);
//   }
// });

// // signaling: answer received
// socket.on('answer', async ({ sdp, from }) => {
//   console.log('answer from', from);
//   const pc = peers.get(from);
//   if (!pc) return console.warn('No PC for', from);
//   await pc.setRemoteDescription(new RTCSessionDescription(sdp));
// });

// // signaling: ice candidate received
// socket.on('ice-candidate', async ({ candidate, from }) => {
//   const pc = peers.get(from);
//   if (!pc) return;
//   try {
//     await pc.addIceCandidate(new RTCIceCandidate(candidate));
//   } catch (err) {
//     console.warn('Error adding received ice candidate', err);
//   }
// });

// socket.on('chat-message', (data) => {
//   appendChat(data);
// });

// // helpers

// async function createPeerConnection(targetSocketId, isInitiator) {
//   if (peers.has(targetSocketId)) return peers.get(targetSocketId);
//   const pc = new RTCPeerConnection(rtcConfig);

//   // add local tracks
//   if (localStream) {
//     for (const track of localStream.getTracks()) {
//       pc.addTrack(track, localStream);
//     }
//   }

//   // create remote video element for this peer
//   const remoteWrapper = document.createElement('div');
//   remoteWrapper.className = 'remote-wrapper';
//   const remoteVideo = document.createElement('video');
//   remoteVideo.autoplay = true;
//   remoteVideo.playsInline = true;
//   remoteVideo.className = 'remote-video';
//   remoteWrapper.appendChild(remoteVideo);
//   remotesDiv.appendChild(remoteWrapper);
//   remoteElements.set(targetSocketId, remoteVideo);

//   // when tracks arrive
//   const inboundStreams = [];
//   pc.ontrack = (event) => {
//     // event.streams is an array — use first stream
//     const [stream] = event.streams;
//     remoteVideo.srcObject = stream;
//   };

//   // ICE candidates -> send to target
//   pc.onicecandidate = (event) => {
//     if (event.candidate) {
//       socket.emit('ice-candidate', { target: targetSocketId, candidate: event.candidate, from: socket.id });
//     }
//   };

//   pc.onconnectionstatechange = () => {
//     console.log('Connection state for', targetSocketId, pc.connectionState);
//     if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected' || pc.connectionState === 'closed') {
//       closePeerConnection(targetSocketId);
//     }
//   };

//   peers.set(targetSocketId, pc);

//   // If initiator, create offer
//   if (isInitiator) {
//     try {
//       const offer = await pc.createOffer();
//       await pc.setLocalDescription(offer);
//       socket.emit('offer', { target: targetSocketId, sdp: pc.localDescription, from: socket.id });
//     } catch (err) {
//       console.error('Error creating offer', err);
//     }
//   }
//   return pc;
// }

// function closePeerConnection(targetSocketId) {
//   const pc = peers.get(targetSocketId);
//   if (pc) {
//     try { pc.close(); } catch (e) {}
//     peers.delete(targetSocketId);
//   }
//   const el = remoteElements.get(targetSocketId);
//   if (el && el.parentNode) el.parentNode.remove();
//   remoteElements.delete(targetSocketId);
// }

// function cleanupAll() {
//   // close all RTCPeerConnections
//   for (const [id, pc] of peers.entries()) {
//     try { pc.close(); } catch (e) {}
//   }
//   peers.clear();
//   // remove remote video elements
//   remotesDiv.innerHTML = '';
//   remoteElements.clear();

//   // stop local media
//   if (localStream) {
//     for (const t of localStream.getTracks()) t.stop();
//     localStream = null;
//     localVideo.srcObject = null;
//   }
// }

// // small utility
// function escapeHtml(unsafe) {
//   return String(unsafe).replace(/[&<>"'`=\/]/g, s => ({
//     '&': '&amp;',
//     '<': '&lt;',
//     '>': '&gt;',
//     '"': '&quot;',
//     "'": '&#39;',
//     '/': '&#x2F;',
//     '`': '&#x60;',
//     '=': '&#x3D;'
//   })[s]);
// }



// const socket = io();
// let localStream, remoteStream, peerConnection;
// const servers = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

// const roomInput = document.getElementById('roomInput');
// const joinBtn = document.getElementById('joinBtn');
// const localVideo = document.getElementById('localVideo');
// const remoteVideo = document.getElementById('remoteVideo');
// const muteBtn = document.getElementById('muteBtn');
// const cameraBtn = document.getElementById('cameraBtn');
// const endBtn = document.getElementById('endBtn');
// const messageInput = document.getElementById('messageInput');
// const sendBtn = document.getElementById('sendBtn');
// const messagesDiv = document.getElementById('messages');

// let roomId, dataChannel;

// joinBtn.onclick = async () => {
//   roomId = roomInput.value.trim();
//   if (!roomId) return alert("Enter a Room ID");

//   document.getElementById('video-container').classList.remove('hidden');
//   document.getElementById('chat-container').classList.remove('hidden');

//   localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
//   localVideo.srcObject = localStream;

//   peerConnection = new RTCPeerConnection(servers);

//   localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));

//   peerConnection.ontrack = (event) => {
//     remoteVideo.srcObject = event.streams[0];
//   };

//   peerConnection.onicecandidate = (event) => {
//     if (event.candidate) socket.emit('ice-candidate', { candidate: event.candidate, roomId });
//   };

//   dataChannel = peerConnection.createDataChannel("chat");
//   dataChannel.onmessage = (e) => addMessage("Peer: " + e.data);

//   socket.emit('join-room', roomId);
// };

// socket.on('user-joined', async () => {
//   const offer = await peerConnection.createOffer();
//   await peerConnection.setLocalDescription(offer);
//   socket.emit('offer', { offer, roomId });
// });

// socket.on('offer', async (data) => {
//   await peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer));
//   const answer = await peerConnection.createAnswer();
//   await peerConnection.setLocalDescription(answer);
//   socket.emit('answer', { answer, roomId });
// });

// socket.on('answer', async (data) => {
//   await peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
// });

// socket.on('ice-candidate', async (candidate) => {
//   if (candidate) await peerConnection.addIceCandidate(candidate);
// });

// sendBtn.onclick = () => {
//   const message = messageInput.value.trim();
//   if (!message) return;
//   addMessage("You: " + message);
//   dataChannel.send(message);
//   messageInput.value = "";
// };

// function addMessage(msg) {
//   const div = document.createElement('div');
//   div.textContent = msg;
//   messagesDiv.appendChild(div);
// }

// muteBtn.onclick = () => {
//   localStream.getAudioTracks()[0].enabled = !localStream.getAudioTracks()[0].enabled;
// };
// cameraBtn.onclick = () => {
//   localStream.getVideoTracks()[0].enabled = !localStream.getVideoTracks()[0].enabled;
// };
// endBtn.onclick = () => location.reload();



const socket = io();
let localStream, remoteStream, peerConnection, dataChannel;
const servers = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

const roomInput = document.getElementById('roomInput');
const joinBtn = document.getElementById('joinBtn');
const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
const muteBtn = document.getElementById('muteBtn');
const cameraBtn = document.getElementById('cameraBtn');
const endBtn = document.getElementById('endBtn');
const messageInput = document.getElementById('messageInput');
const sendBtn = document.getElementById('sendBtn');
const messagesDiv = document.getElementById('messages');

let roomId;

joinBtn.onclick = async () => {
  roomId = roomInput.value.trim();
  if (!roomId) return alert("Enter a Room ID");

  document.getElementById('video-container').classList.remove('hidden');
  document.getElementById('chat-container').classList.remove('hidden');

  // 1️⃣ Get local video/audio stream
  localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
  localVideo.srcObject = localStream;

  // 2️⃣ Create Peer Connection
  peerConnection = new RTCPeerConnection(servers);

  // Add local stream tracks to connection
  localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));

  // 3️⃣ Handle remote stream
  peerConnection.ontrack = (event) => {
    remoteVideo.srcObject = event.streams[0];
  };

  // 4️⃣ ICE candidate exchange
  peerConnection.onicecandidate = (event) => {
    if (event.candidate) socket.emit('ice-candidate', { candidate: event.candidate, roomId });
  };

  // 5️⃣ Data Channel Setup
  // For the offerer (person who joins first)
  dataChannel = peerConnection.createDataChannel("chat");
  dataChannel.onopen = () => {
    console.log("Chat channel opened");
    addMessage("💬 Chat connected!");
  };
  dataChannel.onclose = () => addMessage("❌ Chat disconnected");
  dataChannel.onmessage = (e) => addMessage("Peer: " + e.data);

  // For the answerer (person who joins second)
  peerConnection.ondatachannel = (event) => {
    dataChannel = event.channel;
    dataChannel.onopen = () => {
      console.log("Chat channel opened");
      addMessage("💬 Chat connected!");
    };
    dataChannel.onclose = () => addMessage("❌ Chat disconnected");
    dataChannel.onmessage = (e) => addMessage("Peer: " + e.data);
  };

  // 6️⃣ Join Room via Socket.io
  socket.emit('join-room', roomId);
};

// When another user joins the room (Offerer side)
socket.on('user-joined', async () => {
  const offer = await peerConnection.createOffer();
  await peerConnection.setLocalDescription(offer);
  socket.emit('offer', { offer, roomId });
});

// When you receive an offer (Answerer side)
socket.on('offer', async (data) => {
  await peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer));
  const answer = await peerConnection.createAnswer();
  await peerConnection.setLocalDescription(answer);
  socket.emit('answer', { answer, roomId });
});

// When you receive an answer (Offerer side)
socket.on('answer', async (data) => {
  await peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
});

// When a new ICE candidate is received
socket.on('ice-candidate', async (candidate) => {
  if (candidate) await peerConnection.addIceCandidate(candidate);
});

// ✅ Sending Chat Messages
sendBtn.onclick = () => {
  const message = messageInput.value.trim();
  if (!message) return;

  if (dataChannel && dataChannel.readyState === "open") {
    dataChannel.send(message);
    addMessage("You: " + message);
    messageInput.value = "";
  } else {
    alert("Chat connection not ready yet. Please wait a few seconds.");
  }
};

// Utility: Display messages in chat box
function addMessage(msg) {
  const div = document.createElement('div');
  div.textContent = msg;
  messagesDiv.appendChild(div);
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

// Mute / Camera / End buttons
muteBtn.onclick = () => {
  const audioTrack = localStream.getAudioTracks()[0];
  audioTrack.enabled = !audioTrack.enabled;
  muteBtn.textContent = audioTrack.enabled ? "🔇 Mute" : "🔈 Unmute";
};

cameraBtn.onclick = () => {
  const videoTrack = localStream.getVideoTracks()[0];
  videoTrack.enabled = !videoTrack.enabled;
  cameraBtn.textContent = videoTrack.enabled ? "🎥 Off" : "📷 On";
};

endBtn.onclick = () => {
  if (peerConnection) peerConnection.close();
  socket.disconnect();
  location.reload();
};
