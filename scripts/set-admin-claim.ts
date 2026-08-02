import { initializeApp, getApps } from 'firebase-admin/app';
import { getAuth, UserRecord } from 'firebase-admin/auth';

// Initialize Firebase Admin SDK
if (getApps().length === 0) {
  initializeApp();
}

const auth = getAuth();

async function main() {
  const args = process.argv.slice(2);
  if (args.length < 2) {
    console.error('Usage: tsx scripts/set-admin-claim.ts <grant|revoke> <email_or_uid>');
    process.exit(1);
  }

  const action = args[0].toLowerCase();
  const target = args[1];

  if (action !== 'grant' && action !== 'revoke') {
    console.error('Action must be either "grant" or "revoke"');
    process.exit(1);
  }

  let user: UserRecord;
  try {
    if (target.includes('@')) {
      user = await auth.getUserByEmail(target);
    } else {
      user = await auth.getUser(target);
    }
  } catch (err: any) {
    console.error(`Error finding user "${target}":`, err.message);
    process.exit(1);
  }

  const existingClaims = user.customClaims || {};
  const newClaims = { ...existingClaims };

  if (action === 'grant') {
    newClaims.admin = true;
    console.log(`Granting administrator claim for user...`);
  } else {
    delete newClaims.admin;
    console.log(`Revoking administrator claim for user...`);
  }

  try {
    await auth.setCustomUserClaims(user.uid, newClaims);
    console.log(`\nSuccessfully updated user claims!`);
    console.log(`Affected UID: ${user.uid}`);
    console.log(`Email:        ${user.email || 'N/A'}`);
    console.log(`New Claims:   `, JSON.stringify(newClaims, null, 2));
    console.log(`\nIMPORTANT: The user must log out and log back in, or force a refresh of their Firebase ID token in the client app to obtain the new admin claim (e.g. call auth.currentUser.getIdToken(true)).`);
  } catch (err: any) {
    console.error('Error updating user custom claims:', err.message);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal script error:', err);
  process.exit(1);
});
