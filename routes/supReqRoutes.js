const express = require("express");
const router = express.Router();
const {
  createSupportRequest,
  getStudentSupportRequests,
  getTeacherSupportRequests,
  updateSupportRequestStatus,
} = require("../controllers/supReqController");
const authMiddleware = require("../middlewares/authMiddleware");
const { authorizeRoles } = require("../middlewares/roleMiddleware");


// 👨‍🎓 Créer une nouvelle demande de soutien (par un élève)
router.post("/", authMiddleware,  authorizeRoles("utilisateur"), createSupportRequest);

// 👨‍🎓 Voir mes propres demandes de soutien (élève)
router.get("/my", authMiddleware,  authorizeRoles("utilisateur"), getStudentSupportRequests);

// 👨‍🏫 Voir les demandes reçues (enseignant)
router.get("/teacher", authMiddleware, authorizeRoles("utilisateur"), (_req, res) => {
  return res.status(410).json({ message: "Ce module n'est plus disponible." });
});
 
// 🛠️ Mettre à jour le statut d’une demande (acceptée, refusée, etc.)
router.put("/:id/status", authMiddleware,  authorizeRoles("utilisateur"), updateSupportRequestStatus);

module.exports = router;
