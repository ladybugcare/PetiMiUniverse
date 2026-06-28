"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.streamComandaPdf = streamComandaPdf;
const pdfkit_1 = __importDefault(require("pdfkit"));
const fs = __importStar(require("node:fs"));
const path = __importStar(require("node:path"));
const ORANGE = '#f0642f';
const TEXT_DARK = '#4a3b3a';
const TEXT_MUTED = '#8e6e67';
const BEIGE = '#faf3ee';
const BORDER = '#e5dcd6';
const GREEN_DISC = '#2e7d32';
function brl(n) {
    return Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
function embedOne(x) {
    if (x == null)
        return null;
    return Array.isArray(x) ? x[0] ?? null : x;
}
function statusLabelPt(status) {
    const m = {
        aberta: 'Aberta',
        fechada: 'Fechada',
        cancelada: 'Cancelada',
    };
    return m[status] ?? status;
}
function resolvePetmiHubLogoPath() {
    const candidates = [
        path.join(__dirname, '../../../assets/petmi-hub-logo.png'),
        path.join(__dirname, '../../assets/petmi-hub-logo.png'),
    ];
    for (const p of candidates) {
        if (fs.existsSync(p))
            return p;
    }
    return null;
}
function drawFootersOnAllPages(doc, logoPath) {
    if (!logoPath)
        return;
    const range = doc.bufferedPageRange();
    const pageW = doc.page.width;
    const margin = 40;
    const logoW = 88;
    const logoH = 28;
    for (let i = range.start; i < range.start + range.count; i++) {
        doc.switchToPage(i);
        const footerTop = doc.page.height - margin - logoH - 4;
        const cx = pageW / 2;
        try {
            doc.image(logoPath, cx - logoW / 2, footerTop, { width: logoW, height: logoH, fit: [logoW, logoH] });
        }
        catch {
            /* ignore */
        }
    }
}
function streamComandaPdf(res, payload) {
    const doc = new pdfkit_1.default({ size: 'A4', margin: 40, bufferPages: true });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="comanda-${payload.id.slice(0, 8)}.pdf"`);
    doc.pipe(res);
    const clinic = embedOne(payload.clinic);
    const clinicName = clinic?.name?.trim() || 'Clínica';
    const guardian = payload.guardian;
    const logoPath = resolvePetmiHubLogoPath();
    const items = [...payload.items].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    const margin = 40;
    const contentW = doc.page.width - margin * 2;
    const rightBoxW = 200;
    const leftBlockW = contentW - rightBoxW - 16;
    let y = margin;
    doc.font('Helvetica-Bold').fontSize(14).fillColor(TEXT_DARK).text('Comanda', margin, y, { width: leftBlockW });
    y = doc.y + 2;
    doc.font('Helvetica-Bold').fontSize(22).fillColor(ORANGE).text(clinicName, margin, y, { width: leftBlockW });
    y = doc.y + 4;
    doc.font('Helvetica').fontSize(10).fillColor(TEXT_MUTED).text('Resumo de serviços e valores.', margin, y, {
        width: leftBlockW,
    });
    const boxTop = margin;
    const boxX = doc.page.width - margin - rightBoxW;
    const rightBoxH = 58;
    doc.save();
    doc.roundedRect(boxX, boxTop, rightBoxW, rightBoxH, 8).fill(BEIGE);
    doc.restore();
    let boxY = boxTop + 10;
    doc.font('Helvetica').fontSize(9).fillColor(TEXT_MUTED).text('Nº ', boxX + 12, boxY, { continued: true });
    doc.font('Helvetica-Bold').fillColor(ORANGE).text(payload.id.slice(0, 8).toUpperCase(), { continued: false });
    boxY = doc.y + 4;
    doc.font('Helvetica').fontSize(8.5).fillColor(TEXT_DARK);
    doc.text(`Aberta em: ${new Date(payload.opened_at).toLocaleString('pt-BR')}`, boxX + 12, boxY, {
        width: rightBoxW - 20,
    });
    boxY = doc.y + 2;
    doc.text(`Status: ${statusLabelPt(payload.status)}`, boxX + 12, boxY, { width: rightBoxW - 20 });
    y = Math.max(doc.y, boxTop + rightBoxH) + 14;
    doc.moveTo(margin, y).lineTo(doc.page.width - margin, y).strokeColor(BORDER).lineWidth(0.5).stroke();
    y += 14;
    doc.font('Helvetica-Bold').fontSize(12).fillColor(TEXT_DARK).text('Cliente', margin, y);
    y = doc.y + 6;
    doc.save();
    doc.roundedRect(margin, y, contentW, 56, 6).fill(BEIGE);
    doc.restore();
    const innerPad = 12;
    let y1 = y + innerPad;
    doc.font('Helvetica').fontSize(10).fillColor(TEXT_DARK);
    if (guardian) {
        doc.text(`Nome: ${guardian.full_name}`, margin + innerPad, y1, { width: contentW - innerPad * 2 });
        y1 = doc.y + 2;
        if (guardian.phone)
            doc.text(`Telefone: ${guardian.phone}`, margin + innerPad, y1, { width: contentW - innerPad * 2 });
        y1 = doc.y + 2;
        if (guardian.email)
            doc.text(`E-mail: ${guardian.email}`, margin + innerPad, y1, { width: contentW - innerPad * 2 });
    }
    else {
        doc.text('—', margin + innerPad, y1, { width: contentW - innerPad * 2 });
    }
    y = y + 56 + 18;
    doc.font('Helvetica-Bold').fontSize(12).fillColor(TEXT_DARK).text('Itens', margin, y);
    y = doc.y + 8;
    const wDesc = 220;
    const wPet = 100;
    const wQty = 44;
    const wUnit = 80;
    const wTot = contentW - wDesc - wPet - wQty - wUnit;
    if (items.length === 0) {
        doc.font('Helvetica').fontSize(11).text('—', margin, y);
        y = doc.y + 16;
    }
    else {
        doc.save();
        doc.rect(margin, y, contentW, 22).fill(BEIGE);
        doc.restore();
        doc.font('Helvetica-Bold').fontSize(9).fillColor(TEXT_MUTED);
        let hx = margin + 8;
        doc.text('DESCRIÇÃO', hx, y + 6, { width: wDesc - 8 });
        hx += wDesc;
        doc.text('PET', hx, y + 6, { width: wPet - 8 });
        hx += wPet;
        doc.text('QTD', hx, y + 6, { width: wQty - 8, align: 'right' });
        hx += wQty;
        doc.text('UNIT.', hx, y + 6, { width: wUnit - 8, align: 'right' });
        hx += wUnit;
        doc.text('TOTAL', hx, y + 6, { width: wTot - 8, align: 'right' });
        y += 26;
        doc.font('Helvetica').fontSize(10).fillColor(TEXT_DARK);
        items.forEach((it) => {
            const rowTop = y;
            doc.font('Helvetica-Bold').text(it.description, margin + 4, rowTop, { width: wDesc - 8 });
            doc.font('Helvetica').fontSize(9).text(it.pet_name ?? '—', margin + wDesc + 4, rowTop, { width: wPet - 8 });
            doc.text(String(it.quantity), margin + wDesc + wPet + 4, rowTop, { width: wQty - 8, align: 'right' });
            doc.text(brl(it.unit_amount), margin + wDesc + wPet + wQty + 4, rowTop, { width: wUnit - 8, align: 'right' });
            doc.font('Helvetica-Bold').text(brl(it.line_total), margin + wDesc + wPet + wQty + wUnit + 4, rowTop, {
                width: wTot - 8,
                align: 'right',
            });
            y = rowTop + 20;
            doc.moveTo(margin, y - 4).lineTo(margin + contentW, y - 4).strokeColor('#f5efea').lineWidth(0.5).stroke();
        });
    }
    y += 12;
    doc.font('Helvetica').fontSize(11).fillColor(TEXT_DARK);
    doc.text(`Subtotal: ${brl(payload.subtotal_amount)}`, margin, y, { width: contentW, align: 'right' });
    y = doc.y + 4;
    if (payload.discount_amount > 0) {
        doc.fillColor(GREEN_DISC).text(`Desconto: −${brl(payload.discount_amount)}`, margin, y, { width: contentW, align: 'right' });
        y = doc.y + 4;
    }
    doc.font('Helvetica-Bold').fontSize(18).fillColor(ORANGE);
    doc.text(`Total: ${brl(payload.total_amount)}`, margin, y, { width: contentW, align: 'right' });
    y = doc.y + 12;
    const paid = Number(payload.paid_total ?? 0);
    const balance = Number(payload.balance_due ?? Math.max(0, payload.total_amount - paid));
    if (paid > 0 || balance > 0) {
        doc.font('Helvetica').fontSize(11).fillColor(TEXT_DARK);
        if (paid > 0) {
            doc.text(`Pago: ${brl(paid)}`, margin, y, { width: contentW, align: 'right' });
            y = doc.y + 4;
        }
        if (balance > 0.009) {
            doc.font('Helvetica-Bold').fillColor(ORANGE).text(`Saldo pendente: ${brl(balance)}`, margin, y, {
                width: contentW,
                align: 'right',
            });
            y = doc.y + 4;
        }
    }
    doc.moveDown(1);
    drawFootersOnAllPages(doc, logoPath);
    doc.end();
}
