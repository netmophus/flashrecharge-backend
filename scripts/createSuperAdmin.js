require("dotenv").config();
const mongoose = require("mongoose");
const User = require("../models/userModel");

const MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/aimathsdb";

const createSuperAdmin = async () => {
  try {
    await mongoose.connect(MONGO_URI);
    console.log("✅ Connecté à MongoDB");

    const phone = process.env.SUPER_ADMIN_PHONE || "+22780648383";
    const email = process.env.SUPER_ADMIN_EMAIL || "superadmin@fahimta.com";
    const password = process.env.SUPER_ADMIN_PASSWORD || "123456";
    const fullName = process.env.SUPER_ADMIN_FULLNAME || "Super Admin";

    const exists = await User.findOne({
      $or: [{ phone }, { email: email.toLowerCase().trim() }],
    });

    if (exists) {
      console.log("ℹ️ Super admin déjà existant.");
      process.exit(0);
    }

    const user = new User({
      phone,
      email: email.toLowerCase().trim(),
      password,
      passwordConfirm: password,
      fullName,
      role: "super_admin",
      isVerified: true,
      isActive: true,
      profileCompleted: true,
      tenantAccessMode: "multi_org",
    });

    await user.save();
    console.log("✅ Super admin créé avec succès.");
    console.log(`📱 Phone: ${phone}`);
    console.log(`📧 Email: ${email}`);
    process.exit(0);
  } catch (error) {
    console.error("❌ Erreur createSuperAdmin:", error.message);
    process.exit(1);
  }
};

createSuperAdmin();
