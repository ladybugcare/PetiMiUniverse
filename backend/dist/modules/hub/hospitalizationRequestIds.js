"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveHospitalizationEventsId = resolveHospitalizationEventsId;
const zod_1 = require("zod");
const uuidStr = zod_1.z.string().uuid();
/** Resolve o id da internação na rota ou, por compatibilidade, em `?hospitalization_id=`. */
function resolveHospitalizationEventsId(paramsId, queryHospitalizationId) {
    const fromParams = uuidStr.safeParse(paramsId);
    if (fromParams.success)
        return fromParams.data;
    const fromQuery = uuidStr.safeParse(queryHospitalizationId);
    if (fromQuery.success)
        return fromQuery.data;
    return null;
}
