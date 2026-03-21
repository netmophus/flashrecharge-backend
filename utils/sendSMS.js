const axios = require("axios");
const dotenv = require("dotenv");

dotenv.config();

const LEGACY_SMS_API_URL = process.env.SMS_API_URL;
const LEGACY_SMS_USERNAME = process.env.SMS_USERNAME;
const LEGACY_SMS_PASSWORD = process.env.SMS_PASSWORD;
const LEGACY_SMS_SENDER = process.env.SMS_SENDER || "Softlink";

const BEEM_SMS_API_URL = process.env.BEEM_SMS_API_URL || "https://apisms.beem.africa/v1/send";
const BEEM_API_KEY = process.env.BEEM_API_KEY || process.env.SMS_USERNAME;
const BEEM_SECRET_KEY = process.env.BEEM_SECRET_KEY || process.env.SMS_PASSWORD;
const BEEM_SOURCE_ADDR = String(process.env.BEEM_SOURCE_ADDR || "INFO").trim();

const normalizePhoneForBeem = (raw = "") => String(raw).replace(/\D/g, "");

const sendViaBeem = async (to, message) => {
  if (!BEEM_API_KEY || !BEEM_SECRET_KEY) {
    console.error("❌ Configuration BEEM manquante (BEEM_API_KEY / BEEM_SECRET_KEY).");
    return { success: false, error: "missing_beem_credentials" };
  }

  const destination = normalizePhoneForBeem(to);
  if (!destination) {
    return { success: false, error: "invalid_phone" };
  }

  const text = String(message || "").trim();
  if (!text) {
    return { success: false, error: "empty_message" };
  }

  const basicAuthToken = Buffer.from(`${BEEM_API_KEY}:${BEEM_SECRET_KEY}`).toString("base64");
  const payload = {
    source_addr: BEEM_SOURCE_ADDR,
    encoding: 0,
    schedule_time: "",
    message: text,
    recipients: [
      {
        recipient_id: "1",
        dest_addr: destination,
      },
    ],
  };

  const response = await axios.post(BEEM_SMS_API_URL, payload, {
    headers: {
      "Content-Type": "application/json",
      Authorization: `Basic ${basicAuthToken}`,
    },
  });

  console.log("✅ SMS envoyé via BEEM:", response.data);

  return response.status >= 200 && response.status < 300
    ? { success: true, data: response.data }
    : { success: false, data: response.data, status: response.status };
};

const sendViaLegacy = async (to, message) => {
  if (!LEGACY_SMS_API_URL || !LEGACY_SMS_USERNAME || !LEGACY_SMS_PASSWORD) {
    console.error("❌ Configuration SMS legacy manquante (SMS_API_URL / SMS_USERNAME / SMS_PASSWORD).");
    return { success: false, error: "missing_legacy_sms_credentials" };
  }

  const payload = {
    to,
    from: LEGACY_SMS_SENDER,
    content: message,
    dlr: "yes",
    "dlr-level": 3,
    "dlr-method": "GET",
    "dlr-url": "https://sms.ne/dlr",
  };

  const response = await axios.post(LEGACY_SMS_API_URL, payload, {
    auth: {
      username: LEGACY_SMS_USERNAME,
      password: LEGACY_SMS_PASSWORD,
    },
    headers: {
      "Content-Type": "application/json",
    },
  });

  console.log("✅ SMS envoyé via provider legacy:", response.data);

  return response.status >= 200 && response.status < 300
    ? { success: true, data: response.data }
    : { success: false, data: response.data, status: response.status };
};

const resolveProvider = () => {
  const provider = String(process.env.SMS_PROVIDER || "").toLowerCase().trim();
  if (provider === "beem" || provider === "legacy") return provider;

  if (LEGACY_SMS_API_URL && !LEGACY_SMS_API_URL.includes("beem.africa")) {
    return "legacy";
  }

  if (BEEM_API_KEY && BEEM_SECRET_KEY) {
    return "beem";
  }

  if (LEGACY_SMS_API_URL && LEGACY_SMS_USERNAME && LEGACY_SMS_PASSWORD) {
    return "legacy";
  }

  return "beem";
};

const sendSMS = async (to, message) => {
  try {
    const provider = resolveProvider();
    if (provider === "legacy") {
      return await sendViaLegacy(to, message);
    }

    return await sendViaBeem(to, message);

  } catch (error) {
    if (error.response) {
      const beemCode = error?.response?.data?.data?.code;
      if (beemCode === 111) {
        console.error(
          "❌ BEEM Sender ID invalide (code 111). Configurez BEEM_SOURCE_ADDR avec un sender autorisé dans votre compte BEEM.",
          { sourceAddr: BEEM_SOURCE_ADDR }
        );
      }
      console.error("❌ Erreur API SMS:", error.response.status, error.response.data);
      return {
        success: false,
        status: error.response.status,
        data: error.response.data,
        error: beemCode === 111 ? "invalid_sender_id" : undefined,
      };
    } else {
      console.error("❌ Erreur réseau SMS:", error.message);
    }
    return { success: false, error: error.message };
  }
};

module.exports = { sendSMS };
