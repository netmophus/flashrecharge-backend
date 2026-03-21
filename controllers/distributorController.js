// controllers/distributorController.js
const Distributor = require("../models/distributorModel");
const User = require("../models/userModel");
const DistributorPartnership = require("../models/DistributorPartnership");
const OrganizationLicense = require("../models/OrganizationLicense");
const Organization = require("../models/Organization");
const mongoose = require("mongoose");

const getAdminOrganizationId = (req) => {
  if (req.user?.role !== "admin") return null;
  return req.user?.organizationId || null;
};

/* GET ONE BY PHONE (admin) */
exports.getDistributorByPhone = async (req, res) => {
  try {
    const adminOrganizationId = getAdminOrganizationId(req);
    const rawPhone = String(req.params.phone || req.query.phone || "").trim();
    const digits = toDigits(rawPhone);

    if (!digits) {
      return res.status(400).json({ message: "Numéro de téléphone requis." });
    }

    const findQuery = { phone: { $exists: true, $ne: null } };
    if (adminOrganizationId) {
      findQuery.organizationId = adminOrganizationId;
    }

    // Permet de matcher des numéros avec espaces / tirets / parenthèses.
    const fuzzyPhoneRegex = new RegExp(digits.split("").join("\\D*"));
    findQuery.phone = { $regex: fuzzyPhoneRegex };

    const doc = await Distributor.findOne(findQuery).sort({ updatedAt: -1, createdAt: -1 });
    if (doc) {
      return res.json({
        ...doc.toJSON(),
        sourceType: "distributor",
      });
    }

    const partnerQuery = {
      role: "partner",
      phone: { $regex: fuzzyPhoneRegex },
    };
    if (adminOrganizationId) {
      partnerQuery.organizationId = adminOrganizationId;
    }

    const partner = await User.findOne(partnerQuery)
      .select("_id fullName companyName phone city region isActive")
      .sort({ updatedAt: -1, createdAt: -1 })
      .lean();

    if (!partner) {
      return res.status(404).json({ message: "Aucun distributeur/partenaire trouvé pour ce numéro." });
    }

    return res.json({
      _id: partner._id,
      sourceType: "partner_user",
      name: partner.companyName || partner.fullName || "",
      contact: partner.fullName || "",
      phone: partner.phone || rawPhone,
      whatsapp: partner.phone || "",
      region: partner.region || "",
      city: partner.city || "",
      address: "",
      notes: "",
      isActive: partner.isActive !== false,
    });
  } catch (err) {
    console.error("getDistributorByPhone error:", err);
    return res.status(500).json({ message: err.message || "Erreur serveur." });
  }
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

/* Utils */
const toNum = (v) => {
  if (v === null || v === undefined || v === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
};

const toDigits = (value) => String(value || "").replace(/\D/g, "");

/* ✅ Validation des coordonnées GPS */
const validateCoordinates = (lat, lng) => {
  // Si les deux sont undefined, c'est OK (coordonnées optionnelles)
  if (lat === undefined && lng === undefined) {
    return { valid: true };
  }

  // Si un seul est fourni, c'est invalide
  if ((lat !== undefined && lng === undefined) || (lat === undefined && lng !== undefined)) {
    return { 
      valid: false, 
      message: "Vous devez fournir à la fois latitude ET longitude, ou aucune des deux." 
    };
  }

  // Validation des plages
  if (lat < -90 || lat > 90) {
    return { 
      valid: false, 
      message: "La latitude doit être entre -90 et 90." 
    };
  }

  if (lng < -180 || lng > 180) {
    return { 
      valid: false, 
      message: "La longitude doit être entre -180 et 180." 
    };
  }

  // ⚠️ Avertissement si hors Niger (mais on accepte quand même)
  // Niger approximativement : lat 11-24, lng 0-16
  const inNiger = lat >= 11 && lat <= 24 && lng >= 0 && lng <= 16;
  
  return { 
    valid: true, 
    warning: !inNiger ? "Attention : ces coordonnées semblent être hors du Niger." : null 
  };
};

/* CREATE (admin) */
exports.createDistributor = async (req, res) => {
  try {
    const {
      name,
      contact,
      region,
      city,
      address,
      phone,
      whatsapp,
      latitude,
      longitude,
      hasStock,
      openingHours,
      notes,
      isActive,
      organizationId,
    } = req.body;

    const adminOrganizationId = getAdminOrganizationId(req);
    const targetOrganizationId = adminOrganizationId || organizationId || null;

    if (
      adminOrganizationId &&
      organizationId &&
      String(organizationId) !== String(adminOrganizationId)
    ) {
      return res.status(403).json({ message: "Accès non autorisé pour cette organisation." });
    }

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

      const currentDistributors = await Distributor.countDocuments({ organizationId: targetOrganizationId });
      const seats = Number(activeLicense.seats || 0);
      if (currentDistributors >= seats) {
        return res.status(403).json({
          message: `Quota distributeurs atteint (${currentDistributors}/${seats}). Impossible de créer un nouveau distributeur.`,
        });
      }
    }

    const lat = toNum(latitude);
    const lng = toNum(longitude);

    // ✅ Validation des coordonnées GPS
    const validation = validateCoordinates(lat, lng);
    if (!validation.valid) {
      return res.status(400).json({ message: validation.message });
    }

    const doc = new Distributor({
      organizationId: targetOrganizationId,
      name,
      contact,
      region,
      city,
      address,
      phone,
      whatsapp,
      hasStock: typeof hasStock === "boolean" ? hasStock : true,
      openingHours,
      notes,
      isActive: isActive !== false,
    });

    if (lat !== undefined && lng !== undefined) {
      doc.location = { type: "Point", coordinates: [lng, lat] };
    }

    await doc.save();

    // ✅ Retourner avec avertissement si coordonnées hors Niger
    const response = { ...doc.toJSON() };
    if (validation.warning) {
      response.warning = validation.warning;
    }

    return res.status(201).json(response);
  } catch (err) {
    console.error("createDistributor error:", err);
    return res.status(500).json({ message: err.message || "Erreur serveur." });
  }
};

/* LIST (auth) — distributors accessibles selon rôle/partenariats */
exports.listAccessibleDistributors = async (req, res) => {
  try {
    const role = req.user?.role;
    let { page = 1, pageSize = 20, search = "" } = req.query;
    page = Math.max(parseInt(page, 10) || 1, 1);
    pageSize = Math.min(Math.max(parseInt(pageSize, 10) || 20, 1), 100);

    const filter = { isActive: true };

    if (role === "admin" && req.user?.organizationId) {
      filter.organizationId = req.user.organizationId;
    } else if (role === "partner") {
      const now = new Date();
      const partnerships = await DistributorPartnership.find({
        distributorUserId: req.user._id,
        status: "active",
        startsAt: { $lte: now },
        $or: [{ endsAt: null }, { endsAt: { $gte: now } }],
      }).select("organizationId");

      const orgIds = partnerships
        .map((p) => p.organizationId)
        .filter(Boolean);

      if (orgIds.length === 0) {
        return res.json({
          data: [],
          pagination: { page, pageSize, total: 0, pages: 0 },
        });
      }

      filter.organizationId = { $in: orgIds };
    }

    if (search && search.trim()) {
      filter.$text = { $search: search.trim() };
    }

    const [total, data] = await Promise.all([
      Distributor.countDocuments(filter),
      Distributor.find(filter)
        .sort(search ? { score: { $meta: "textScore" } } : { createdAt: -1 })
        .skip((page - 1) * pageSize)
        .limit(pageSize),
    ]);

    return res.json({
      data,
      pagination: {
        page,
        pageSize,
        total,
        pages: Math.ceil(total / pageSize),
      },
    });
  } catch (err) {
    console.error("listAccessibleDistributors error:", err);
    return res.status(500).json({ message: "Erreur serveur." });
  }
};

/* LIST (public) — recherche + pagination */
exports.listDistributors = async (req, res) => {
  try {
    let { page = 1, pageSize = 10, search = "", region, city, active, organizationId } = req.query;
    page = Math.max(parseInt(page, 10) || 1, 1);
    pageSize = Math.min(Math.max(parseInt(pageSize, 10) || 10, 1), 100);

    const filter = {};
    if (active === "true") filter.isActive = true;
    if (active === "false") filter.isActive = false;
    if (region) filter.region = region;
    if (city) filter.city = city;
    if (organizationId) {
      if (!mongoose.Types.ObjectId.isValid(organizationId)) {
        return res.status(400).json({ message: "organizationId invalide." });
      }
      filter.organizationId = organizationId;
    }

    // texte plein via index $text si search fourni
    if (search && search.trim()) {
      filter.$text = { $search: search.trim() };
    }

    const [total, data] = await Promise.all([
      Distributor.countDocuments(filter),
      Distributor.find(filter)
        .sort(search ? { score: { $meta: "textScore" } } : { createdAt: -1 })
        .skip((page - 1) * pageSize)
        .limit(pageSize),
    ]);

    return res.json({
      data,
      pagination: {
        page,
        pageSize,
        total,
        pages: Math.ceil(total / pageSize),
      },
    });
  } catch (err) {
    console.error("listDistributors error:", err);
    return res.status(500).json({ message: "Erreur serveur." });
  }
};

/* GET ONE (public) */
exports.getDistributorById = async (req, res) => {
  try {
    const query = { _id: req.params.id };
    if (req.query.organizationId) {
      if (!mongoose.Types.ObjectId.isValid(req.query.organizationId)) {
        return res.status(400).json({ message: "organizationId invalide." });
      }
      query.organizationId = req.query.organizationId;
    }

    const doc = await Distributor.findOne(query);
    if (!doc) return res.status(404).json({ message: "Introuvable." });
    return res.json(doc);
  } catch (err) {
    console.error("getDistributorById error:", err);
    return res.status(500).json({ message: "Erreur serveur." });
  }
};

/* UPDATE (admin) */
exports.updateDistributor = async (req, res) => {
  try {
    const adminOrganizationId = getAdminOrganizationId(req);
    const findQuery = { _id: req.params.id };
    if (adminOrganizationId) {
      findQuery.organizationId = adminOrganizationId;
    }

    const doc = await Distributor.findOne(findQuery);
    if (!doc) return res.status(404).json({ message: "Introuvable." });

    const {
      name,
      contact,
      region,
      city,
      address,
      phone,
      whatsapp,
      latitude,
      longitude,
      hasStock,
      openingHours,
      notes,
      isActive,
    } = req.body;

    if (name !== undefined) doc.name = name;
    if (contact !== undefined) doc.contact = contact;
    if (region !== undefined) doc.region = region;
    if (city !== undefined) doc.city = city;
    if (address !== undefined) doc.address = address;
    if (phone !== undefined) doc.phone = phone;
    if (whatsapp !== undefined) doc.whatsapp = whatsapp;
    if (hasStock !== undefined) doc.hasStock = !!hasStock;
    if (openingHours !== undefined) doc.openingHours = openingHours;
    if (notes !== undefined) doc.notes = notes;
    if (isActive !== undefined) doc.isActive = !!isActive;

    // ✅ Gestion géoloc avec validation
    const lat = toNum(latitude);
    const lng = toNum(longitude);
    const latProvided = latitude !== undefined;
    const lngProvided = longitude !== undefined;

    let geoWarning = null;

    if (latProvided || lngProvided) {
      // ✅ Validation des coordonnées
      const validation = validateCoordinates(lat, lng);
      if (!validation.valid) {
        return res.status(400).json({ message: validation.message });
      }
      
      if (lat !== undefined && lng !== undefined) {
        doc.location = { type: "Point", coordinates: [lng, lat] };
        geoWarning = validation.warning;
      } else {
        // on supprime si partiellement fourni / invalide
        doc.location = undefined;
      }
    }

    await doc.save();

    // ✅ Retourner avec avertissement si coordonnées hors Niger
    const response = { ...doc.toJSON() };
    if (geoWarning) {
      response.warning = geoWarning;
    }

    return res.json(response);
  } catch (err) {
    console.error("updateDistributor error:", err);
    return res.status(500).json({ message: err.message || "Erreur serveur." });
  }
};

/* DELETE (admin) */
exports.deleteDistributor = async (req, res) => {
  try {
    const adminOrganizationId = getAdminOrganizationId(req);
    const query = { _id: req.params.id };
    if (adminOrganizationId) {
      query.organizationId = adminOrganizationId;
    }

    const doc = await Distributor.findOneAndDelete(query);
    if (!doc) return res.status(404).json({ message: "Introuvable." });
    return res.json({ success: true });
  } catch (err) {
    console.error("deleteDistributor error:", err);
    return res.status(500).json({ message: "Erreur serveur." });
  }
};

/* NEARBY (public) — require lat/lng */
exports.listNearbyDistributors = async (req, res) => {
  try {
    const lat = toNum(req.query.lat);
    const lng = toNum(req.query.lng);
    const radiusKm = toNum(req.query.radiusKm) ?? 10;
    const { organizationId } = req.query;

    // ✅ Ajout pagination
    let { page = 1, pageSize = 10 } = req.query;
    page = Math.max(parseInt(page, 10) || 1, 1);
    pageSize = Math.min(Math.max(parseInt(pageSize, 10) || 10, 1), 100);

    if (lat === undefined || lng === undefined) {
      return res.status(400).json({ message: "Paramètres lat/lng requis." });
    }

    if (organizationId && !mongoose.Types.ObjectId.isValid(organizationId)) {
      return res.status(400).json({ message: "organizationId invalide." });
    }

    // ✅ Accepter les rayons de 0m à 200km (pas de minimum à 100m)
    const meters = Math.max(0, Math.min(radiusKm * 1000, 200000)); // 0m → 200km

    // ✅ Pipeline avec pagination
    const pipeline = [
      {
        $geoNear: {
          near: { type: "Point", coordinates: [lng, lat] },
          distanceField: "distanceMeters",
          maxDistance: meters,
          spherical: true,
          query: {
            isActive: true,
            location: { $exists: true },
            ...(organizationId ? { organizationId: new mongoose.Types.ObjectId(organizationId) } : {}),
          },
        },
      },
      { $sort: { distanceMeters: 1 } },
    ];

    // Compter le total avant pagination
    const countPipeline = [...pipeline, { $count: "total" }];
    const countResult = await Distributor.aggregate(countPipeline);
    const total = countResult.length > 0 ? countResult[0].total : 0;

    // Appliquer la pagination
    const dataPipeline = [
      ...pipeline,
      { $skip: (page - 1) * pageSize },
      { $limit: pageSize },
    ];
    const data = await Distributor.aggregate(dataPipeline);

    // ✅ Retour avec structure cohérente (comme listDistributors)
    return res.json({
      data,
      pagination: {
        page,
        pageSize,
        total,
        pages: Math.ceil(total / pageSize),
      },
      radiusMeters: meters,
    });
  } catch (err) {
    console.error("listNearbyDistributors error:", err);
    return res.status(500).json({ message: "Erreur serveur." });
  }
};
