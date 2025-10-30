"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractRequestMetadata = exports.createAuditLog = void 0;
const supabase_1 = require("../config/supabase");
const createAuditLog = async (params) => {
    try {
        const { data, error } = await supabase_1.supabase.from('audit_logs').insert([
            {
                user_id: params.user_id,
                clinic_id: params.clinic_id,
                unit_id: params.unit_id,
                action: params.action,
                entity_type: params.entity_type,
                entity_id: params.entity_id,
                old_values: params.old_values,
                new_values: params.new_values,
                ip_address: params.ip_address,
                user_agent: params.user_agent,
            },
        ]);
        if (error) {
            console.error('Error creating audit log:', error);
        }
        return data;
    }
    catch (error) {
        console.error('Unexpected error in createAuditLog:', error);
        return null;
    }
};
exports.createAuditLog = createAuditLog;
// Helper function to extract IP and user agent from request
const extractRequestMetadata = (req) => {
    const ip_address = req.headers['x-forwarded-for']?.split(',')[0] ||
        req.socket.remoteAddress ||
        '';
    const user_agent = req.headers['user-agent'] || '';
    return { ip_address, user_agent };
};
exports.extractRequestMetadata = extractRequestMetadata;
