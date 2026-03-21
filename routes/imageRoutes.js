
const express = require("express");
const router = express.Router();
const multer = require("multer");

const {
  uploadAndSolveImage,
  callMathpixOCR , 
   callGptVisionSolve,
} = require("../controllers/imageToTextController");

const { callGemini } = require("../controllers/geminiController");
const authMiddleware = require("../middlewares/authMiddleware");
const { authorizeRoles } = require("../middlewares/roleMiddleware");

const upload = multer({ dest: "uploads/" });

// 🔵 OCR Tesseract
router.post(
  "/upload",
  authMiddleware,
  authorizeRoles("utilisateur"),
  upload.single("image"),
  uploadAndSolveImage
);

// 🔵 Gemini IA via texte manuel
router.post(
  "/solve",
  authMiddleware,
  authorizeRoles("utilisateur"),
  callGemini
);

// 🔵 OCR Mathpix (nouvelle route)
router.post(
  "/mathpix",
  authMiddleware,
  authorizeRoles("utilisateur"),
  upload.single("image"),
  callMathpixOCR
);



// 🔵 GPT-Vision (analyse d'image avec OpenAI)
router.post(
  "/gpt",
  authMiddleware,
  authorizeRoles("utilisateur"),
  upload.single("image"),
  callGptVisionSolve
);


module.exports = router;
