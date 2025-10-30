"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const pets_1 = __importDefault(require("./routes/pets"));
const supabase_1 = require("./config/supabase");
const clinics_1 = __importDefault(require("./routes/clinics"));
const vets_1 = __importDefault(require("./routes/vets"));
const demands_1 = __importDefault(require("./routes/demands"));
const applications_1 = __importDefault(require("./routes/applications"));
const auth_1 = __importDefault(require("./routes/auth"));
const specialties_1 = __importDefault(require("./routes/specialties"));
const marketplace_1 = __importDefault(require("./routes/marketplace"));
const marketplaceMessages_1 = __importDefault(require("./routes/marketplaceMessages"));
const units_1 = __importDefault(require("./routes/units"));
const clinicUsers_1 = __importDefault(require("./routes/clinicUsers"));
const statistics_1 = __importDefault(require("./routes/statistics"));
const demandPositions_1 = __importDefault(require("./routes/demandPositions"));
const admin_1 = __importDefault(require("./routes/admin"));
const supportTickets_1 = __importDefault(require("./routes/supportTickets"));
const app = (0, express_1.default)();
// CORS configuration for different environments
const allowedOrigins = [
    'http://localhost:3000',
    'https://peti-vet-git-staging-petivet.vercel.app',
    process.env.FRONTEND_URL
].filter((origin) => Boolean(origin));
app.use((0, cors_1.default)({
    origin: allowedOrigins,
    credentials: true
}));
// Increase payload limit to support image uploads (base64 encoded)
app.use(express_1.default.json({ limit: '50mb' }));
app.use(express_1.default.urlencoded({ limit: '50mb', extended: true }));
// Rotas
app.use('/auth', auth_1.default);
app.use('/pets', pets_1.default);
app.use('/clinics', clinics_1.default);
app.use('/vets', vets_1.default);
app.use('/demands', demands_1.default);
app.use('/applications', applications_1.default);
app.use('/specialties', specialties_1.default);
app.use('/marketplace', marketplace_1.default);
app.use('/marketplace/messages', marketplaceMessages_1.default);
app.use('/units', units_1.default);
app.use('/clinic-users', clinicUsers_1.default);
app.use('/statistics', statistics_1.default);
app.use('/demand-positions', demandPositions_1.default);
app.use('/admin', admin_1.default);
app.use('/support', supportTickets_1.default);
// ... rest of the file
app.get('/test-supabase', async (req, res) => {
    const { data, error } = await supabase_1.supabase.from('test').select('*');
    if (error)
        return res.status(400).json({ error });
    res.json({ data });
});
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🐾 Server running on port ${PORT}`));
