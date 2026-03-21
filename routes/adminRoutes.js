const express = require("express");
const router = express.Router();
const { 
  createAdmin, 
  createRechargeCode, 
  getAllUsers, 
  toggleUserStatus, 
  getAdminStats,
  exportUsersCSV, // ✅ Nouveau
  bulkActionUsers, // ✅ Nouveau
  getUserDetails, // ✅ Nouveau
  sendSMSToUser, // ✅ SMS individuel
  sendBulkSMS, // ✅ SMS groupé
  sendMarketingSMS, // ✅ SMS marketing
} = require("../controllers/adminController");
const authMiddleware = require("../middlewares/authMiddleware");
const { authorizeRoles } = require("../middlewares/roleMiddleware");
const User = require("../models/userModel");
router.post("/create", createAdmin);


const mongoose = require("mongoose");


const AccessCodeBatch = require("../models/AccessCodeBatch");
const OrganizationLicense = require("../models/OrganizationLicense");
const Organization = require("../models/Organization");

const getOrganizationScope = (req) => {
  if (req.user?.role === "admin" && req.user?.organizationId) {
    return { organizationId: req.user.organizationId };
  }
  return {};
};

const getActiveOrganizationLicense = async (organizationId) => {
  if (!organizationId) return null;
  const now = new Date();
  return OrganizationLicense.findOne({
    organizationId,
    status: "active",
    startsAt: { $lte: now },
    endsAt: { $gte: now },
  }).sort({ endsAt: -1, createdAt: -1 });
};

const organizationRequiresDistributorLicense = async (organizationId) => {
  if (!organizationId) return false;

  const organization = await Organization.findById(organizationId)
    .select("organizationType")
    .lean();

  if (!organization) return true;
  return String(organization.organizationType || "telco") === "telco";
};

const getOrganizationLicenseStatus = async (organizationId) => {
  const organization = await Organization.findById(organizationId)
    .select("name slug organizationType")
    .lean();

  if (!organization) {
    return null;
  }

  const requiresDistributorLicense =
    String(organization.organizationType || "telco") === "telco";

  const activeLicense = requiresDistributorLicense
    ? await getActiveOrganizationLicense(organizationId)
    : null;

  const dashboardVariant = requiresDistributorLicense ? "licensed" : "service";

  return {
    organization: {
      _id: organization._id,
      name: organization.name,
      slug: organization.slug,
      organizationType: organization.organizationType || "telco",
    },
    requiresDistributorLicense,
    dashboardVariant,
    hasActiveLicense: Boolean(activeLicense),
    activeLicense: activeLicense
      ? {
          _id: activeLicense._id,
          code: activeLicense.code,
          planName: activeLicense.planName,
          seats: activeLicense.seats,
          startsAt: activeLicense.startsAt,
          endsAt: activeLicense.endsAt,
          status: activeLicense.status,
        }
      : null,
  };
};



// ✅ Créer un code de recharge (admin uniquement)
router.post(
  "/recharge-code",
  authMiddleware,
  authorizeRoles("admin"),
  createRechargeCode
);


router.get("/users", 
   authMiddleware,
  authorizeRoles("admin"),  
  getAllUsers);  
  
  
  
router.put("/users/:id/toggle", 
   authMiddleware,
  authorizeRoles("admin"),  
  toggleUserStatus); 

router.get("/stats", authMiddleware, authorizeRoles("admin"), getAdminStats);

router.get("/license-status", authMiddleware, authorizeRoles("admin"), async (req, res) => {
  try {
    const orgScope = getOrganizationScope(req);
    const organizationId = orgScope.organizationId || null;

    if (!organizationId) {
      return res.status(400).json({ message: "Aucune organisation associée à cet admin." });
    }

    const payload = await getOrganizationLicenseStatus(organizationId);
    if (!payload) {
      return res.status(404).json({ message: "Organisation introuvable." });
    }

    return res.json(payload);
  } catch (error) {
    console.error("get /admin/license-status error:", error);
    return res.status(500).json({ message: "Erreur serveur lors du chargement du statut licence." });
  }
});

// ✅ NOUVEAUX ENDPOINTS
// Export CSV des utilisateurs
router.get("/users/export", authMiddleware, authorizeRoles("admin"), exportUsersCSV);

// Actions groupées (activation/désactivation multiple)
router.post("/users/bulk-action", authMiddleware, authorizeRoles("admin"), bulkActionUsers);

// Détails complets d'un utilisateur
router.get("/users/:id/details", authMiddleware, authorizeRoles("admin"), getUserDetails);

// 📱 Envoyer un SMS à un utilisateur
router.post("/users/:userId/send-sms", authMiddleware, authorizeRoles("admin"), sendSMSToUser);

// 📱 Envoyer un SMS groupé
router.post("/users/send-bulk-sms", authMiddleware, authorizeRoles("admin"), sendBulkSMS);

// 📢 Envoyer un SMS marketing à tous les utilisateurs
router.post("/users/send-marketing-sms", authMiddleware, authorizeRoles("admin"), sendMarketingSMS);


// POST /api/admin/partners
router.post("/partners", authMiddleware, authorizeRoles("admin"), async (req, res) => {
  try {
    const {
      fullName, phone, password, passwordConfirm,
      companyName, region, commissionDefaultCfa
    } = req.body;

    const orgScope = getOrganizationScope(req);
    const targetOrganizationId = orgScope.organizationId || null;

    if (targetOrganizationId) {
      const shouldEnforceLicense = await organizationRequiresDistributorLicense(targetOrganizationId);
      if (!shouldEnforceLicense) {
        return res.status(403).json({
          message: "Organisation de type service_consumer: création de distributeurs non autorisée.",
        });
      }

      const activeLicense = await getActiveOrganizationLicense(targetOrganizationId);
      if (!activeLicense) {
        return res.status(403).json({
          message: "Aucune licence active pour votre organisation. Création distributeur bloquée.",
        });
      }

      const seats = Number(activeLicense.seats || 0);
      const currentPartners = await User.countDocuments({ role: "partner", organizationId: targetOrganizationId });
      if (currentPartners >= seats) {
        return res.status(403).json({
          message: `Quota distributeurs atteint (${currentPartners}/${seats}). Impossible de créer un nouveau distributeur.`,
        });
      }
    }

    const u = await User.create({
      fullName,
      phone,
      password,
      passwordConfirm,
      role: "partner",
      organizationId: targetOrganizationId,
      companyName: companyName || "",
      region: region || "",
      commissionDefaultCfa: Number(commissionDefaultCfa || 0),
    });

    res.status(201).json({
      _id: u._id,
      fullName: u.fullName,
      phone: u.phone,
      role: u.role,
      organizationId: u.organizationId,
      companyName: u.companyName,
      region: u.region,
      commissionDefaultCfa: u.commissionDefaultCfa,
      createdAt: u.createdAt,
    });
  } catch (e) {
    if (e?.code === 11000 && e?.keyPattern?.phone) {
      return res.status(409).json({ message: "Un utilisateur avec ce téléphone existe déjà." });
    }
    console.error("create partner error:", e);
    res.status(400).json({ message: e.message || "Erreur création partenaire." });
  }
});

// GET /api/admin/partners (inchangé)
router.get("/partners", authMiddleware, authorizeRoles("admin"), async (req, res) => {
  try {
    const rows = await User.find({ role: "partner", ...getOrganizationScope(req) })
      .select("_id fullName phone companyName region commissionDefaultCfa createdAt")
      .sort({ createdAt: -1 });
    res.json(rows);
  } catch (e) {
    console.error("list partners error:", e);
    res.status(500).json({ message: "Erreur de chargement des partenaires." });
  }
});



// GET /api/admin/partners/:partnerId/codes?status=all|activated|used
// GET /api/admin/partners/:partnerId/codes?status=all|activated|used
router.get(
  "/partners/:partnerId/codes",
  authMiddleware,
  authorizeRoles("admin"),
  async (req, res) => {
    try {
      const { partnerId } = req.params;
      const status = String(req.query.status || "all").toLowerCase();

      // 1) Validate ObjectId
      if (!mongoose.Types.ObjectId.isValid(partnerId)) {
        return res.status(400).json({ message: "partnerId invalide." });
      }
      const partnerObjId = new mongoose.Types.ObjectId(partnerId);

      // 2) (Optionnel) check que le partenaire existe
      const partnerExists = await User.exists({ _id: partnerObjId, role: "partner", ...getOrganizationScope(req) });
      if (!partnerExists) {
        return res.status(404).json({ message: "Partenaire introuvable." });
      }

      // 3) Build pipeline
      const matchStatus =
        status !== "all" ? { "codes.status": status } : {};

      const pipeline = [
        { $match: { "codes.partner": partnerObjId, ...getOrganizationScope(req) } },
        { $unwind: "$codes" },
        { $match: { "codes.partner": partnerObjId, ...matchStatus } },
        {
          $project: {
            _id: 0,
            batchId: "$batchId",
            type: "$type",
            faceValueCfa: { $ifNull: ["$codes.price", "$price"] },
            code: "$codes.code",
            status: "$codes.status", // generated | activated | used
            assignedAt: "$codes.assignedAt",
            activatedAt: "$codes.activatedAt",
            soldAt: "$codes.soldAt",
            usedAt: "$codes.usedAt",
            commissionCfa: { $ifNull: ["$codes.commissionCfa", 0] }
          }
        },
        {
          $sort: {
            // tri par date la plus récente connue
            assignedAt: -1,
            activatedAt: -1,
            soldAt: -1,
            usedAt: -1
          }
        }
      ];

      const items = await AccessCodeBatch.aggregate(pipeline);
      return res.json({ count: items.length, items });
    } catch (e) {
      console.error("admin get partner codes error:", e);
      return res.status(500).json({ message: "Erreur serveur." });
    }
  }
);




module.exports = router;
