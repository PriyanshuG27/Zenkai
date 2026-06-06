/**
 * deployRules.cjs
 * Deploys the local firestore.rules file directly to the Firebase console
 * using the Firebase Admin SDK and the serviceAccountKey.json.
 *
 * Run: node scripts/deployRules.cjs
 */

const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');

console.log('\n🚀 Starting programmatic Firestore Rules deployment via Admin SDK...\n');

// 1. Resolve paths
const serviceAccountPath = path.join(__dirname, '..', 'serviceAccountKey.json');
const rulesPath = path.join(__dirname, '..', 'firestore.rules');

if (!fs.existsSync(serviceAccountPath)) {
  console.error('❌ Error: serviceAccountKey.json not found in the project root.');
  console.error('Please make sure the service account key file is present.');
  process.exit(1);
}

if (!fs.existsSync(rulesPath)) {
  console.error('❌ Error: firestore.rules file not found.');
  process.exit(1);
}

// 2. Initialize Firebase Admin
let serviceAccount;
try {
  serviceAccount = require(serviceAccountPath);
} catch (e) {
  console.error('❌ Error parsing serviceAccountKey.json:', e.message);
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

async function deploy() {
  try {
    const rulesSource = fs.readFileSync(rulesPath, 'utf8');
    console.log('Reading rules file: successfully loaded.');

    const securityRules = admin.securityRules();

    console.log('Deploying rules to Firestore...');
    
    // Create rules file object
    const rulesFile = securityRules.createRulesFileFromSource('firestore.rules', rulesSource);
    
    // Create the ruleset
    const ruleset = await securityRules.createRuleset(rulesFile);
    console.log(`Created ruleset version: ${ruleset.name}`);

    // Release the ruleset
    await securityRules.releaseFirestoreRuleset(ruleset.name);

    console.log('\n🎉 Firestore Security Rules deployed successfully!\n');
    process.exit(0);
  } catch (err) {
    console.error('\n❌ Deployment failed with error:\n', err.message || err);
    console.error('\nPlease check your service account permissions. It requires the "Firebase Rules Admin" role or "Project Owner/Editor" role.');
    process.exit(1);
  }
}

deploy();
