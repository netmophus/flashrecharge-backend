const express = require("express");
const router = express.Router();

const User = require("../models/userModel"); // 

const authMiddleware = require("../middlewares/authMiddleware");
const { authorizeRoles } = require("../middlewares/roleMiddleware");


// Route pour rechercher un utilisateur par téléphone (pour les partenaires)
router.get("/by-phone/:phone", authMiddleware, authorizeRoles("partner", "admin"), async (req, res) => {
  try {
    const { phone } = req.params;
    
    // Rechercher l'utilisateur par téléphone
    const user = await User.findOne({ phone: phone }).select("-password -otp");
    
    if (!user) {
      return res.status(404).json({ message: "Aucun utilisateur trouvé avec ce numéro de téléphone" });
    }
    
    res.json(user);
  } catch (error) {
    console.error("Erreur recherche utilisateur par téléphone:", error);
    res.status(500).json({ message: "Erreur serveur lors de la recherche" });
  }
});

// Route pour ajouter une carte à un utilisateur
router.post("/:userId/cards", authMiddleware, authorizeRoles("partner", "admin"), async (req, res) => {
  try {
    const { userId } = req.params;
    const cardData = req.body;
    
    // Vérifier que l'utilisateur existe
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "Utilisateur non trouvé" });
    }
    
    // Ajouter la carte aux données de l'utilisateur
    if (!user.cards) {
      user.cards = [];
    }
    
    user.cards.push({
      ...cardData,
      createdAt: new Date(),
    });
    
    await user.save();
    
    res.json({ message: "Carte ajoutée avec succès", cards: user.cards });
  } catch (error) {
    console.error("Erreur ajout carte:", error);
    res.status(500).json({ message: "Erreur serveur lors de l'ajout de la carte" });
  }
});

// Route pour récupérer les cartes d'un utilisateur
router.get("/:userId/cards", authMiddleware, authorizeRoles("utilisateur", "partner", "admin"), async (req, res) => {
  try {
    const { userId } = req.params;
    
    // Vérifier que l'utilisateur peut accéder à ses propres cartes
    if (req.user._id.toString() !== userId && req.user.role !== "admin" && req.user.role !== "partner") {
      return res.status(403).json({ message: "Accès non autorisé" });
    }
    
    // Vérifier que l'utilisateur existe
    const user = await User.findById(userId).select("cards");
    if (!user) {
      return res.status(404).json({ message: "Utilisateur non trouvé" });
    }
    
    res.json({ cards: user.cards || [] });
  } catch (error) {
    console.error("Erreur récupération cartes:", error);
    res.status(500).json({ message: "Erreur serveur lors de la récupération des cartes" });
  }
});

// Route pour archiver une carte d'un utilisateur (persistance)
router.patch("/:userId/cards/:cardId/archive", authMiddleware, authorizeRoles("utilisateur", "partner", "admin"), async (req, res) => {
  try {
    const { userId, cardId } = req.params;

    if (req.user._id.toString() !== userId && req.user.role !== "admin" && req.user.role !== "partner") {
      return res.status(403).json({ message: "Accès non autorisé" });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "Utilisateur non trouvé" });
    }

    const card = user.cards.id(cardId);
    if (!card) {
      return res.status(404).json({ message: "Carte non trouvée" });
    }

    card.archived = true;
    card.archivedAt = new Date();
    await user.save();

    res.json({ message: "Carte archivée avec succès", card });
  } catch (error) {
    console.error("Erreur archivage carte:", error);
    res.status(500).json({ message: "Erreur serveur lors de l'archivage de la carte" });
  }
});

// Fallback d'archivage pour cartes sans _id (anciennes entrées)
router.patch("/:userId/cards/archive", authMiddleware, authorizeRoles("utilisateur", "partner", "admin"), async (req, res) => {
  try {
    const { userId } = req.params;
    const { cardId, code, serialNumber, purchaseDate } = req.body || {};

    if (req.user._id.toString() !== userId && req.user.role !== "admin" && req.user.role !== "partner") {
      return res.status(403).json({ message: "Accès non autorisé" });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "Utilisateur non trouvé" });
    }

    let card = null;
    if (cardId) {
      card = user.cards.id(cardId);
    }

    if (!card) {
      const codeNorm = String(code || "").trim();
      const serialNorm = String(serialNumber || "").trim();
      const purchaseNorm = purchaseDate ? new Date(purchaseDate).toISOString().slice(0, 10) : "";

      const idx = user.cards.findIndex((c) => {
        if (c.archived) return false;
        const sameCode = codeNorm && String(c.code || "").trim() === codeNorm;
        const sameSerial = serialNorm && String(c.serialNumber || "").trim() === serialNorm;
        if (!sameCode && !sameSerial) return false;
        if (!purchaseNorm) return true;
        const cDate = c.purchaseDate ? new Date(c.purchaseDate).toISOString().slice(0, 10) : "";
        return cDate === purchaseNorm;
      });
      if (idx >= 0) card = user.cards[idx];
    }

    if (!card) {
      return res.status(404).json({ message: "Carte non trouvée" });
    }

    card.archived = true;
    card.archivedAt = new Date();
    await user.save();

    res.json({ message: "Carte archivée avec succès", card });
  } catch (error) {
    console.error("Erreur archivage fallback carte:", error);
    res.status(500).json({ message: "Erreur serveur lors de l'archivage de la carte" });
  }
});


// // 👇 Route pour récupérer le profil de l'utilisateur connecté (enseignant)
// router.get(
//   "/profile",
//   authMiddleware,
//   authorizeRoles("teacher"),
//   (req, res) => {
//     res.json(req.user); // Renvoie le profil sans mot de passe
//   }
// );







module.exports = router;
