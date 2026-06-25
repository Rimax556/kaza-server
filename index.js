const express = require('express');
const admin = require('firebase-admin');
const app = express();
app.use(express.json());

const serviceAccount = require('./service-account.json');
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();
const messaging = admin.messaging();

// Écoute les nouveaux messages
db.collectionGroup('messages').onSnapshot(async (snap) => {
  for (const change of snap.docChanges()) {
    if (change.type !== 'added') continue;
    const msg = change.doc.data();
    const toUid = msg.toUid;
    if (!toUid) continue;

    const userDoc = await db.collection('users').doc(toUid).get();
    if (!userDoc.exists) continue;
    const userData = userDoc.data();
    if (userData.notificationsOn === false) continue;
    const token = userData.fcmToken;
    if (!token) continue;

    let senderName = "Quelqu'un";
    try {
      const senderDoc = await db.collection('users').doc(msg.fromUid).get();
      if (senderDoc.exists) senderName = senderDoc.data().name || senderName;
    } catch (_) {}

    try {
      await messaging.send({
        notification: { title: senderName, body: msg.text || 'Nouveau message' },
        token,
      });
      console.log('Notif message envoyée à', toUid);
    } catch (e) {
      console.log('Erreur notif message:', e.message);
    }
  }
});

// Écoute les nouvelles annonces
db.collection('properties').onSnapshot(async (snap) => {
  for (const change of snap.docChanges()) {
    if (change.type !== 'added') continue;
    const prop = change.doc.data();

    const usersSnap = await db.collection('users')
      .where('notificationsOn', '!=', false).get();

    const tokens = usersSnap.docs
      .map(d => d.data().fcmToken)
      .filter(t => t);

    if (tokens.length === 0) continue;

    try {
      await messaging.sendEachForMulticast({
        tokens,
        notification: {
          title: 'Nouvelle annonce Kaza 🏠',
          body: prop.title || 'Un nouveau bien est disponible',
        },
      });
      console.log('Notif nouvelle annonce envoyée');
    } catch (e) {
      console.log('Erreur notif annonce:', e.message);
    }
  }
});

app.get('/', (req, res) => res.send('Kaza server running'));
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Serveur démarré sur port', PORT));