const express = require("express");
const router = express.Router();

const authMiddleware = require("../middlewares/authMiddleware");
const { authorizeRoles } = require("../middlewares/roleMiddleware");
const {
  createOrganization,
  listOrganizations,
  updateOrganization,
  deleteOrganization,
  listOrganizationLicenses,
  createOrganizationLicense,
  updateOrganizationLicense,
  deleteOrganizationLicense,
  listOrganizationAdmins,
  toggleOrganizationAdminStatus,
  createOrganizationAdmin,
  assignOrganizationAdmin,
  listAllUsers,
  getDashboardOverview,
  createService,
  listServices,
  createDistributorPartnership,
  listDistributorPartnerships,
} = require("../controllers/superAdminController");

router.use(authMiddleware, authorizeRoles("super_admin"));

router.get("/organizations", listOrganizations);
router.post("/organizations", createOrganization);
router.put("/organizations/:organizationId", updateOrganization);
router.delete("/organizations/:organizationId", deleteOrganization);
router.get("/licenses", listOrganizationLicenses);
router.post("/organizations/:organizationId/licenses", createOrganizationLicense);
router.put("/licenses/:licenseId", updateOrganizationLicense);
router.delete("/licenses/:licenseId", deleteOrganizationLicense);
router.get("/organization-admins", listOrganizationAdmins);
router.patch("/organization-admins/:adminUserId/toggle", toggleOrganizationAdminStatus);
router.post("/organizations/:organizationId/admins", createOrganizationAdmin);
router.post("/organizations/:organizationId/assign-admin", assignOrganizationAdmin);
router.get("/users", listAllUsers);
router.get("/dashboard/overview", getDashboardOverview);

router.get("/services", listServices);
router.post("/services", createService);

router.get("/partnerships", listDistributorPartnerships);
router.post("/partnerships", createDistributorPartnership);

module.exports = router;
