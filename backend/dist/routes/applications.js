"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const applicationsController_1 = require("../controllers/applicationsController");
const router = express_1.default.Router();
router.post('/apply', applicationsController_1.applyToDemand);
router.get('/demand/:demand_id', applicationsController_1.getApplicationsByDemand);
router.get('/clinic', applicationsController_1.getApplicationsByClinic);
router.get('/unit/:unitId', applicationsController_1.getApplicationsByUnit);
router.get('/pending-count', applicationsController_1.getPendingApplicationsCount);
exports.default = router;
