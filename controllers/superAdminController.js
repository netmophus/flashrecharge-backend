const Organization = require("../models/Organization");
const OrganizationLicense = require("../models/OrganizationLicense");
const DistributorPartnership = require("../models/DistributorPartnership");
const AccessCodeBatch = require("../models/AccessCodeBatch");
const ServiceCatalog = require("../models/ServiceCatalog");
const User = require("../models/userModel");
const mongoose = require("mongoose");

const slugify = (value = "") =>
  value
    .toString()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "");

const buildLicenseCode = (orgSlug) => {
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `${orgSlug.toUpperCase()}-${Date.now()}-${rand}`;
};

const normalizeOrganizationType = (value) => {
  const type = String(value || "telco").trim().toLowerCase();
  return ["telco", "service_consumer"].includes(type) ? type : "telco";
};

const organizationRequiresDistributorLicense = (organization) =>
  String(organization?.organizationType || "telco") === "telco";

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

exports.listOrganizationLicenses = async (req, res) => {
  try {
    const { organizationId } = req.query;
    const query = {};
    if (organizationId) query.organizationId = organizationId;

    const licenses = await OrganizationLicense.find(query)
      .populate("organizationId", "name slug")
      .sort({ createdAt: -1 });

    return res.json(licenses);
  } catch (error) {
    console.error("listOrganizationLicenses error:", error);
    return res.status(500).json({ message: "Erreur serveur lors du chargement des licences." });
  }
};

exports.updateOrganization = async (req, res) => {
  try {
    const { organizationId } = req.params;
    const organization = await Organization.findById(organizationId);
    if (!organization) {
      return res.status(404).json({ message: "Organisation introuvable." });
    }

    const {
      name,
      legalName,
      country,
      currency,
      timezone,
      contactEmail,
      contactPhone,
      address,
      organizationType,
      isActive,
    } = req.body;

    if (name !== undefined) {
      const trimmedName = String(name || "").trim();
      if (!trimmedName) {
        return res.status(400).json({ message: "Le nom de l'organisation est requis." });
      }
      if (trimmedName !== organization.name) {
        let nextSlug = slugify(trimmedName);
        if (!nextSlug) nextSlug = `org-${Date.now()}`;
        const slugExists = await Organization.findOne({ slug: nextSlug, _id: { $ne: organization._id } });
        if (slugExists) {
          return res.status(409).json({ message: "Une organisation avec ce nom existe déjà." });
        }
        organization.slug = nextSlug;
      }
      organization.name = trimmedName;
    }

    if (legalName !== undefined) organization.legalName = legalName;
    if (country !== undefined) organization.country = country;
    if (currency !== undefined) organization.currency = currency;
    if (timezone !== undefined) organization.timezone = timezone;
    if (contactEmail !== undefined) organization.contactEmail = contactEmail;
    if (contactPhone !== undefined) organization.contactPhone = contactPhone;
    if (address !== undefined) organization.address = address;
    if (organizationType !== undefined) {
      organization.organizationType = normalizeOrganizationType(organizationType);
    }
    if (isActive !== undefined) organization.isActive = Boolean(isActive);

    await organization.save();
    return res.json(organization);
  } catch (error) {
    console.error("updateOrganization error:", error);
    return res.status(500).json({ message: "Erreur serveur lors de la modification de l'organisation." });
  }
};

exports.deleteOrganization = async (req, res) => {
  try {
    const { organizationId } = req.params;
    const organization = await Organization.findById(organizationId).select("name");
    if (!organization) {
      return res.status(404).json({ message: "Organisation introuvable." });
    }

    const [licensesCount, adminsCount, partnersCount, partnershipsCount] = await Promise.all([
      OrganizationLicense.countDocuments({ organizationId }),
      User.countDocuments({ organizationId, role: "admin" }),
      User.countDocuments({ organizationId, role: "partner" }),
      DistributorPartnership.countDocuments({ organizationId }),
    ]);

    if (licensesCount > 0 || adminsCount > 0 || partnersCount > 0 || partnershipsCount > 0) {
      return res.status(409).json({
        message: "Suppression impossible: retirez d'abord les éléments liés (licences/admins/partenaires/partenariats).",
        linked: {
          licensesCount,
          adminsCount,
          partnersCount,
          partnershipsCount,
        },
      });
    }

    await Organization.deleteOne({ _id: organizationId });
    return res.json({ success: true, message: `Organisation ${organization.name} supprimée.` });
  } catch (error) {
    console.error("deleteOrganization error:", error);
    return res.status(500).json({ message: "Erreur serveur lors de la suppression de l'organisation." });
  }
};

exports.listOrganizationAdmins = async (req, res) => {
  try {
    const { organizationId, onlyUnassigned } = req.query;
    const query = { role: "admin" };

    if (onlyUnassigned === "true") {
      query.organizationId = null;
    } else if (organizationId) {
      query.organizationId = organizationId;
    }

    const admins = await User.find(query)
      .select("_id fullName phone email organizationId isActive createdAt")
      .sort({ createdAt: -1 });

    return res.json(admins);
  } catch (error) {
    console.error("listOrganizationAdmins error:", error);
    return res.status(500).json({ message: "Erreur serveur lors du chargement des admins organisation." });
  }
};

exports.toggleOrganizationAdminStatus = async (req, res) => {
  try {
    const { adminUserId } = req.params;

    const adminUser = await User.findById(adminUserId)
      .select("_id fullName phone email role organizationId isActive");

    if (!adminUser || adminUser.role !== "admin") {
      return res.status(404).json({ message: "Admin organisation introuvable." });
    }

    adminUser.isActive = !adminUser.isActive;
    await adminUser.save();

    return res.json({
      message: adminUser.isActive ? "Admin activé avec succès." : "Admin désactivé avec succès.",
      admin: {
        _id: adminUser._id,
        fullName: adminUser.fullName,
        phone: adminUser.phone,
        email: adminUser.email,
        role: adminUser.role,
        organizationId: adminUser.organizationId,
        isActive: adminUser.isActive,
      },
    });
  } catch (error) {
    console.error("toggleOrganizationAdminStatus error:", error);
    return res.status(500).json({ message: "Erreur serveur lors du changement de statut admin." });
  }
};

exports.assignOrganizationAdmin = async (req, res) => {
  try {
    const { organizationId } = req.params;
    const { adminUserId } = req.body;

    if (!adminUserId) {
      return res.status(400).json({ message: "adminUserId est requis." });
    }

    const [organization, adminUser] = await Promise.all([
      Organization.findById(organizationId),
      User.findById(adminUserId),
    ]);

    if (!organization) {
      return res.status(404).json({ message: "Organisation introuvable." });
    }

    if (!adminUser || adminUser.role !== "admin") {
      return res.status(400).json({ message: "Utilisateur admin introuvable ou rôle invalide." });
    }

    adminUser.organizationId = organization._id;
    adminUser.isActive = true;
    adminUser.isVerified = true;
    await adminUser.save();

    return res.json({
      message: "Admin affecté à l'organisation avec succès.",
      admin: {
        _id: adminUser._id,
        fullName: adminUser.fullName,
        phone: adminUser.phone,
        email: adminUser.email,
        role: adminUser.role,
        organizationId: adminUser.organizationId,
      },
    });
  } catch (error) {
    console.error("assignOrganizationAdmin error:", error);
    return res.status(500).json({ message: "Erreur serveur lors de l'affectation de l'admin." });
  }
};

exports.createOrganization = async (req, res) => {
  try {
    const { name, legalName, country, currency, timezone, contactEmail, contactPhone, address, organizationType } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ message: "Le nom de l'organisation est requis." });
    }

    let slug = slugify(name);
    if (!slug) slug = `org-${Date.now()}`;

    const exists = await Organization.findOne({ slug });
    if (exists) {
      return res.status(409).json({ message: "Une organisation avec ce nom existe déjà." });
    }

    const normalizedOrganizationType = normalizeOrganizationType(organizationType);

    const organization = await Organization.create({
      name: name.trim(),
      slug,
      legalName,
      country,
      currency,
      timezone,
      contactEmail,
      contactPhone,
      address,
      organizationType: normalizedOrganizationType,
      createdBy: req.user._id,
    });

    return res.status(201).json(organization);
  } catch (error) {
    console.error("createOrganization error:", error);
    return res.status(500).json({ message: "Erreur serveur lors de la création de l'organisation." });
  }
};

exports.listOrganizations = async (_req, res) => {
  try {
    const organizations = await Organization.find().sort({ createdAt: -1 });
    return res.json(organizations);
  } catch (error) {
    console.error("listOrganizations error:", error);
    return res.status(500).json({ message: "Erreur serveur lors du chargement des organisations." });
  }
};

exports.createOrganizationLicense = async (req, res) => {
  try {
    const { organizationId } = req.params;
    const { planName, seats = 1, startsAt, endsAt, notes } = req.body;

    if (!planName || !startsAt || !endsAt) {
      return res.status(400).json({ message: "planName, startsAt et endsAt sont requis." });
    }

    const organization = await Organization.findById(organizationId);
    if (!organization) {
      return res.status(404).json({ message: "Organisation introuvable." });
    }

    if (!organizationRequiresDistributorLicense(organization)) {
      return res.status(403).json({
        message: "Cette organisation ne gère pas de distributeurs. Licence distributeur non applicable.",
      });
    }

    const license = await OrganizationLicense.create({
      organizationId: organization._id,
      code: buildLicenseCode(organization.slug),
      planName,
      seats,
      startsAt,
      endsAt,
      notes,
      createdBy: req.user._id,
    });

    return res.status(201).json(license);
  } catch (error) {
    console.error("createOrganizationLicense error:", error);
    return res.status(500).json({ message: "Erreur serveur lors de la création de la licence." });
  }
};

exports.updateOrganizationLicense = async (req, res) => {
  try {
    const { licenseId } = req.params;
    const license = await OrganizationLicense.findById(licenseId);
    if (!license) {
      return res.status(404).json({ message: "Licence introuvable." });
    }

    const { planName, seats, startsAt, endsAt, notes, status } = req.body;

    if (planName !== undefined) {
      const nextPlanName = String(planName || "").trim();
      if (!nextPlanName) {
        return res.status(400).json({ message: "planName est requis." });
      }
      license.planName = nextPlanName;
    }

    if (seats !== undefined) {
      const parsedSeats = Number(seats);
      if (!Number.isFinite(parsedSeats) || parsedSeats < 1) {
        return res.status(400).json({ message: "seats doit être un nombre >= 1." });
      }
      license.seats = parsedSeats;
    }

    if (startsAt !== undefined) license.startsAt = startsAt;
    if (endsAt !== undefined) license.endsAt = endsAt;
    if (notes !== undefined) license.notes = notes;

    if (status !== undefined) {
      const normalizedStatus = String(status).trim().toLowerCase();
      const allowedStatus = ["draft", "active", "suspended", "expired"];
      if (!allowedStatus.includes(normalizedStatus)) {
        return res.status(400).json({ message: "status invalide." });
      }
      license.status = normalizedStatus;
    }

    await license.save();
    return res.json(license);
  } catch (error) {
    console.error("updateOrganizationLicense error:", error);
    return res.status(500).json({ message: "Erreur serveur lors de la modification de la licence." });
  }
};

exports.deleteOrganizationLicense = async (req, res) => {
  try {
    const { licenseId } = req.params;
    const deleted = await OrganizationLicense.findByIdAndDelete(licenseId);
    if (!deleted) {
      return res.status(404).json({ message: "Licence introuvable." });
    }
    return res.json({ success: true, message: "Licence supprimée." });
  } catch (error) {
    console.error("deleteOrganizationLicense error:", error);
    return res.status(500).json({ message: "Erreur serveur lors de la suppression de la licence." });
  }
};

exports.createOrganizationAdmin = async (req, res) => {
  try {
    const { organizationId } = req.params;
    const { fullName, phone, email, password, passwordConfirm } = req.body;

    if (!fullName || !password || !passwordConfirm || (!phone && !email)) {
      return res.status(400).json({
        message: "fullName, password, passwordConfirm et phone/email sont requis.",
      });
    }

    const organization = await Organization.findById(organizationId);
    if (!organization) {
      return res.status(404).json({ message: "Organisation introuvable." });
    }

    const alreadyExists = await User.findOne({
      $or: [phone ? { phone } : null, email ? { email } : null].filter(Boolean),
    });

    if (alreadyExists) {
      return res.status(409).json({ message: "Un utilisateur existe déjà avec ce téléphone/email." });
    }

    const admin = new User({
      fullName,
      phone,
      email,
      password,
      passwordConfirm,
      role: "admin",
      organizationId: organization._id,
      isVerified: true,
      isActive: true,
    });

    await admin.save();

    return res.status(201).json({
      _id: admin._id,
      fullName: admin.fullName,
      phone: admin.phone,
      email: admin.email,
      role: admin.role,
      organizationId: admin.organizationId,
      createdAt: admin.createdAt,
    });
  } catch (error) {
    console.error("createOrganizationAdmin error:", error);
    return res.status(500).json({ message: "Erreur serveur lors de la création de l'admin organisation." });
  }
};

exports.listAllUsers = async (req, res) => {
  try {
    const page = Math.max(1, Number.parseInt(req.query.page || "1", 10));
    const limit = Math.max(1, Math.min(Number.parseInt(req.query.limit || "20", 10), 100));
    const q = String(req.query.q || "").trim();
    const role = String(req.query.role || "").trim();
    const organizationId = String(req.query.organizationId || "").trim();

    const query = {};
    if (role) query.role = role;
    if (organizationId) query.organizationId = organizationId;
    if (q) {
      query.$or = [
        { fullName: { $regex: q, $options: "i" } },
        { phone: { $regex: q, $options: "i" } },
        { email: { $regex: q, $options: "i" } },
        { companyName: { $regex: q, $options: "i" } },
        { schoolName: { $regex: q, $options: "i" } },
      ];
    }

    const [items, total] = await Promise.all([
      User.find(query)
        .select("_id fullName phone email role organizationId schoolName companyName city region isActive isSubscribed createdAt")
        .populate("organizationId", "name slug")
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      User.countDocuments(query),
    ]);

    return res.json({
      items,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
    });
  } catch (error) {
    console.error("listAllUsers error:", error);
    return res.status(500).json({ message: "Erreur serveur lors du chargement des utilisateurs." });
  }
};

exports.getDashboardOverview = async (req, res) => {
  try {
    const organizationId = String(req.query.organizationId || "").trim();
    const distributorPage = Math.max(1, Number.parseInt(req.query.distributorPage || "1", 10));
    const distributorLimit = Math.max(5, Math.min(Number.parseInt(req.query.distributorLimit || "20", 10), 100));
    const distributorSkip = (distributorPage - 1) * distributorLimit;

    let organizationObjectId = null;
    if (organizationId) {
      if (!mongoose.Types.ObjectId.isValid(organizationId)) {
        return res.status(400).json({ message: "organizationId invalide." });
      }
      organizationObjectId = new mongoose.Types.ObjectId(organizationId);
    }

    const saleMatchStage = {
      $match: {
        "codes.partner": { $ne: null },
        $or: [
          { "codes.soldAt": { $ne: null } },
          { "codes.status": { $in: ["sold", "activated", "used"] } },
        ],
      },
    };
    if (organizationObjectId) {
      saleMatchStage.$match.organizationId = organizationObjectId;
    }

    const distributorGroupingStages = [
      { $unwind: "$codes" },
      saleMatchStage,
      {
        $group: {
          _id: {
            organizationId: "$organizationId",
            distributorId: "$codes.partner",
          },
          soldCards: { $sum: 1 },
          revenue: { $sum: { $ifNull: ["$codes.price", "$price"] } },
          lastSaleAt: { $max: { $ifNull: ["$codes.soldAt", "$codes.activatedAt"] } },
        },
      },
    ];

    const [
      totalUsers,
      totalOrganizations,
      usersByRole,
      salesByOrganization,
      distributorTotalsAgg,
      distributorCountAgg,
      salesByDistributorByOrganization,
    ] = await Promise.all([
      User.countDocuments({}),
      Organization.countDocuments({}),
      User.aggregate([
        { $group: { _id: "$role", count: { $sum: 1 } } },
        { $project: { _id: 0, role: { $ifNull: ["$_id", "unknown"] }, count: 1 } },
        { $sort: { count: -1 } },
      ]),
      AccessCodeBatch.aggregate([
        { $unwind: "$codes" },
        saleMatchStage,
        {
          $group: {
            _id: "$organizationId",
            soldCards: { $sum: 1 },
            revenue: { $sum: { $ifNull: ["$codes.price", "$price"] } },
            lastSaleAt: { $max: { $ifNull: ["$codes.soldAt", "$codes.activatedAt"] } },
          },
        },
        {
          $lookup: {
            from: "organizations",
            localField: "_id",
            foreignField: "_id",
            as: "organization",
          },
        },
        { $unwind: { path: "$organization", preserveNullAndEmptyArrays: true } },
        {
          $project: {
            _id: 0,
            organizationId: "$_id",
            organizationName: { $ifNull: ["$organization.name", "Sans organisation"] },
            soldCards: 1,
            revenue: 1,
            lastSaleAt: 1,
          },
        },
        { $sort: { soldCards: -1, revenue: -1 } },
      ]),
      AccessCodeBatch.aggregate([
        ...distributorGroupingStages,
        {
          $group: {
            _id: null,
            distributorsWithSales: { $sum: 1 },
            soldCards: { $sum: "$soldCards" },
            revenue: { $sum: "$revenue" },
          },
        },
      ]),
      AccessCodeBatch.aggregate([
        ...distributorGroupingStages,
        { $count: "total" },
      ]),
      AccessCodeBatch.aggregate([
        ...distributorGroupingStages,
        {
          $lookup: {
            from: "organizations",
            localField: "_id.organizationId",
            foreignField: "_id",
            as: "organization",
          },
        },
        { $unwind: { path: "$organization", preserveNullAndEmptyArrays: true } },
        {
          $lookup: {
            from: "users",
            localField: "_id.distributorId",
            foreignField: "_id",
            as: "distributor",
          },
        },
        { $unwind: { path: "$distributor", preserveNullAndEmptyArrays: true } },
        {
          $project: {
            _id: 0,
            organizationId: "$_id.organizationId",
            organizationName: { $ifNull: ["$organization.name", "Sans organisation"] },
            distributorId: "$_id.distributorId",
            distributorName: {
              $ifNull: [
                "$distributor.companyName",
                { $ifNull: ["$distributor.fullName", "Distributeur inconnu"] },
              ],
            },
            distributorPhone: { $ifNull: ["$distributor.phone", ""] },
            soldCards: 1,
            revenue: 1,
            lastSaleAt: 1,
          },
        },
        { $sort: { soldCards: -1, revenue: -1, distributorName: 1 } },
        { $skip: distributorSkip },
        { $limit: distributorLimit },
      ]),
    ]);

    const distributorTotals = distributorTotalsAgg?.[0] || {
      distributorsWithSales: 0,
      soldCards: 0,
      revenue: 0,
    };
    const distributorsTotal = Number(distributorCountAgg?.[0]?.total || 0);

    return res.json({
      totals: {
        users: totalUsers,
        organizations: totalOrganizations,
        distributorsWithSales: Number(distributorTotals.distributorsWithSales || 0),
        soldCards: Number(distributorTotals.soldCards || 0),
        revenue: Number(distributorTotals.revenue || 0),
      },
      selectedOrganizationId: organizationId || null,
      usersByRole,
      salesByOrganization,
      salesByDistributorByOrganization,
      distributorPagination: {
        page: distributorPage,
        limit: distributorLimit,
        total: distributorsTotal,
        totalPages: Math.max(1, Math.ceil(distributorsTotal / distributorLimit)),
      },
    });
  } catch (error) {
    console.error("getDashboardOverview error:", error);
    return res.status(500).json({ message: "Erreur serveur lors du chargement du dashboard super admin." });
  }
};

exports.createService = async (req, res) => {
  try {
    const { code, name, category, provider, metadata, isActive } = req.body;

    if (!code || !name) {
      return res.status(400).json({ message: "code et name sont requis." });
    }

    const exists = await ServiceCatalog.findOne({ code: code.toUpperCase().trim() });
    if (exists) {
      return res.status(409).json({ message: "Ce code service existe déjà." });
    }

    const service = await ServiceCatalog.create({
      code,
      name,
      category,
      provider,
      metadata,
      isActive,
      createdBy: req.user._id,
    });

    return res.status(201).json(service);
  } catch (error) {
    console.error("createService error:", error);
    return res.status(500).json({ message: "Erreur serveur lors de la création du service." });
  }
};

exports.listServices = async (_req, res) => {
  try {
    const services = await ServiceCatalog.find().sort({ createdAt: -1 });
    return res.json(services);
  } catch (error) {
    console.error("listServices error:", error);
    return res.status(500).json({ message: "Erreur serveur lors du chargement des services." });
  }
};

exports.createDistributorPartnership = async (req, res) => {
  try {
    const { organizationId, distributorUserId, startsAt, endsAt, canViewData, canSellCards, canSellAirtime } = req.body;

    if (!organizationId || !distributorUserId) {
      return res.status(400).json({ message: "organizationId et distributorUserId sont requis." });
    }

    const [organization, distributor] = await Promise.all([
      Organization.findById(organizationId),
      User.findById(distributorUserId),
    ]);

    if (!organization) {
      return res.status(404).json({ message: "Organisation introuvable." });
    }
    if (!distributor || distributor.role !== "partner") {
      return res.status(400).json({ message: "Le distributeur doit être un utilisateur de rôle partner." });
    }

    if (!organizationRequiresDistributorLicense(organization)) {
      return res.status(403).json({
        message: "Organisation de type service_consumer: partenariats distributeurs non autorisés.",
      });
    }

    const activeLicense = await getActiveOrganizationLicense(organizationId);
    if (!activeLicense) {
      return res.status(403).json({
        message: "Aucune licence active pour cette organisation. Création de partenariat bloquée.",
      });
    }

    const existingPartnership = await DistributorPartnership.findOne({ organizationId, distributorUserId })
      .select("_id status");

    const seats = Number(activeLicense.seats || 0);
    const activePartnershipsCount = await DistributorPartnership.countDocuments({
      organizationId,
      status: "active",
    });

    const alreadyActive = existingPartnership?.status === "active";
    if (!alreadyActive && activePartnershipsCount >= seats) {
      return res.status(403).json({
        message: `Quota distributeurs atteint (${activePartnershipsCount}/${seats}). Impossible d'ajouter un nouveau partenariat actif.`,
      });
    }

    const partnership = await DistributorPartnership.findOneAndUpdate(
      { organizationId, distributorUserId },
      {
        organizationId,
        distributorUserId,
        status: "active",
        startsAt: startsAt || new Date(),
        endsAt: endsAt || null,
        canViewData: canViewData !== false,
        canSellCards: canSellCards !== false,
        canSellAirtime: !!canSellAirtime,
        createdBy: req.user._id,
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    return res.status(201).json(partnership);
  } catch (error) {
    console.error("createDistributorPartnership error:", error);
    return res.status(500).json({ message: "Erreur serveur lors de la création du partenariat." });
  }
};

exports.listDistributorPartnerships = async (req, res) => {
  try {
    const { organizationId, distributorUserId, status } = req.query;
    const query = {};

    if (organizationId) query.organizationId = organizationId;
    if (distributorUserId) query.distributorUserId = distributorUserId;
    if (status) query.status = status;

    const rows = await DistributorPartnership.find(query)
      .populate("organizationId", "name slug")
      .populate("distributorUserId", "fullName phone companyName")
      .sort({ createdAt: -1 });

    return res.json(rows);
  } catch (error) {
    console.error("listDistributorPartnerships error:", error);
    return res.status(500).json({ message: "Erreur serveur lors du chargement des partenariats." });
  }
};
