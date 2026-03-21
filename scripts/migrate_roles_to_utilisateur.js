const mongoose = require("mongoose");
const dotenv = require("dotenv");

dotenv.config();

const User = require("../models/userModel");

async function run() {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    // eslint-disable-next-line no-console
    console.error("❌ MONGO_URI manquant dans .env");
    process.exit(1);
  }

  await mongoose.connect(uri);

  const rolesToMigrate = ["eleve", "teacher"];

  const beforeCount = await User.countDocuments({ role: { $in: rolesToMigrate } });

  const res = await User.updateMany(
    { role: { $in: rolesToMigrate } },
    { $set: { role: "utilisateur" } }
  );

  const afterCount = await User.countDocuments({ role: { $in: rolesToMigrate } });

  // eslint-disable-next-line no-console
  console.log("✅ Migration terminée");
  // eslint-disable-next-line no-console
  console.log("- Utilisateurs concernés (avant):", beforeCount);
  // eslint-disable-next-line no-console
  console.log("- Modifiés:", res.modifiedCount ?? res.nModified ?? 0);
  // eslint-disable-next-line no-console
  console.log("- Restants à migrer:", afterCount);

  await mongoose.disconnect();
}

run().catch(async (err) => {
  // eslint-disable-next-line no-console
  console.error("❌ Erreur migration:", err);
  try {
    await mongoose.disconnect();
  } catch (_) {
    // ignore
  }
  process.exit(1);
});
