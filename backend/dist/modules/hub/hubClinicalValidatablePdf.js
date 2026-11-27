"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CLINICAL_PDF = void 0;
exports.truncateHash = truncateHash;
exports.drawLabelValue = drawLabelValue;
exports.drawClinicHeaderRight = drawClinicHeaderRight;
exports.drawCenteredDocumentTitle = drawCenteredDocumentTitle;
exports.drawPartyIdentification = drawPartyIdentification;
exports.drawClinicalStampBlock = drawClinicalStampBlock;
exports.drawValidationFooter = drawValidationFooter;
const qrcode_1 = __importDefault(require("qrcode"));
const prescriptionValidation_1 = require("./prescriptionValidation");
const hubVetStampPdf_1 = require("./hubVetStampPdf");
exports.CLINICAL_PDF = {
    textDark: '#222222',
    textMuted: '#666666',
    border: '#333333',
    margin: 48,
};
function truncateHash(hash, edge = 8) {
    if (hash.length <= edge * 2 + 1)
        return hash;
    return `${hash.slice(0, edge)}…${hash.slice(-edge)}`;
}
function drawLabelValue(doc, label, value, x, y, width) {
    doc.font('Helvetica-Bold').fontSize(10).fillColor(exports.CLINICAL_PDF.textDark).text(`${label}: `, x, y, {
        width,
        continued: true,
    });
    doc.font('Helvetica').fontSize(10).fillColor(exports.CLINICAL_PDF.textDark).text(value || 'Não informado', { width });
    return doc.y;
}
/** Cabeçalho da clínica alinhado à direita + nome do veterinário. */
function drawClinicHeaderRight(doc, opts) {
    const { margin, pageW, clinic, veterinarian } = opts;
    let y = margin;
    const headerX = margin;
    doc
        .font('Helvetica-Bold')
        .fontSize(12)
        .fillColor(exports.CLINICAL_PDF.textDark)
        .text(clinic?.name || 'Clínica veterinária', headerX, y, { width: pageW, align: 'right' });
    y = doc.y + 2;
    const clinicAddress = clinic ? (0, prescriptionValidation_1.formatClinicAddress)(clinic) : '';
    if (clinicAddress) {
        doc
            .font('Helvetica')
            .fontSize(9)
            .fillColor(exports.CLINICAL_PDF.textMuted)
            .text(clinicAddress, headerX, y, { width: pageW, align: 'right' });
        y = doc.y + 1;
    }
    if (clinic?.phone) {
        doc
            .font('Helvetica')
            .fontSize(9)
            .fillColor(exports.CLINICAL_PDF.textMuted)
            .text(clinic.phone, headerX, y, { width: pageW, align: 'right' });
        y = doc.y + 1;
    }
    if (clinic?.email) {
        doc
            .font('Helvetica')
            .fontSize(9)
            .fillColor(exports.CLINICAL_PDF.textMuted)
            .text(clinic.email, headerX, y, { width: pageW, align: 'right' });
        y = doc.y + 1;
    }
    if (veterinarian?.full_name) {
        doc
            .font('Helvetica-Bold')
            .fontSize(10)
            .fillColor(exports.CLINICAL_PDF.textDark)
            .text(veterinarian.full_name, headerX, y + 2, { width: pageW, align: 'right' });
        y = doc.y;
    }
    return y + 18;
}
/** Título central + linha divisória. */
function drawCenteredDocumentTitle(doc, title, margin, pageW, y) {
    doc
        .font('Helvetica-Bold')
        .fontSize(16)
        .fillColor(exports.CLINICAL_PDF.textDark)
        .text(title, margin, y, { width: pageW, align: 'center' });
    y = doc.y + 8;
    doc
        .moveTo(margin, y)
        .lineTo(doc.page.width - margin, y)
        .strokeColor(exports.CLINICAL_PDF.border)
        .lineWidth(1)
        .stroke();
    return y + 14;
}
/** Bloco «Identificação do pet e responsável» em duas colunas. */
function drawPartyIdentification(doc, opts) {
    const { margin, pageW, pet, guardian } = opts;
    let y = opts.y;
    doc
        .font('Helvetica-Bold')
        .fontSize(10)
        .fillColor(exports.CLINICAL_PDF.textDark)
        .text('Identificação do pet e responsável', margin, y, {
        width: pageW * 0.55,
        continued: false,
    });
    const dateLabel = opts.issuedAt
        ? new Date(opts.issuedAt).toLocaleDateString('pt-BR')
        : new Date().toLocaleDateString('pt-BR');
    const expiresLabel = opts.expiresAt ? new Date(opts.expiresAt).toLocaleDateString('pt-BR') : null;
    const datesBlock = expiresLabel
        ? `Emitida: ${dateLabel}  ·  Válida até: ${expiresLabel}`
        : `Emitida: ${dateLabel}`;
    doc
        .font('Helvetica')
        .fontSize(9)
        .fillColor(exports.CLINICAL_PDF.textDark)
        .text(datesBlock, margin, y, { width: pageW, align: 'right' });
    y = Math.max(doc.y, y + 14) + 6;
    const colGap = 24;
    const colW = (pageW - colGap) / 2;
    const leftX = margin;
    const rightX = margin + colW + colGap;
    let leftY = y;
    let rightY = y;
    leftY = drawLabelValue(doc, 'Pet', pet?.name || '—', leftX, leftY, colW) + 4;
    leftY = drawLabelValue(doc, 'Espécie', pet?.species || 'Não informado', leftX, leftY, colW) + 4;
    leftY = drawLabelValue(doc, 'Raça', pet?.breed || 'Não informado', leftX, leftY, colW) + 4;
    leftY = drawLabelValue(doc, 'Idade', (0, prescriptionValidation_1.formatAgeFromBirthDate)(pet?.birth_date), leftX, leftY, colW) + 4;
    rightY = drawLabelValue(doc, 'Responsável', guardian?.full_name || '—', rightX, rightY, colW) + 4;
    rightY =
        drawLabelValue(doc, 'Endereço', guardian ? (0, prescriptionValidation_1.formatGuardianAddress)(guardian) : 'Não informado', rightX, rightY, colW) + 4;
    rightY = drawLabelValue(doc, 'Telefone', guardian?.phone || 'Não informado', rightX, rightY, colW) + 4;
    rightY = drawLabelValue(doc, 'CPF', (0, prescriptionValidation_1.formatTaxIdDisplay)(guardian?.tax_id), rightX, rightY, colW) + 4;
    rightY =
        drawLabelValue(doc, 'RG', guardian?.id_doc_number?.trim() || 'Não informado', rightX, rightY, colW) + 4;
    return Math.max(leftY, rightY) + 16;
}
async function drawClinicalStampBlock(doc, veterinarian, opts) {
    const stampBuffers = await (0, hubVetStampPdf_1.loadVetStampBuffers)(veterinarian);
    const y = Math.max(opts.y + 24, Math.min(opts.y + 40, doc.page.height - 160));
    return (0, hubVetStampPdf_1.drawVetStampBlock)(doc, veterinarian, {
        margin: opts.margin,
        pageW: opts.pageW,
        y,
        signatureBuf: stampBuffers.signature,
        stampBuf: stampBuffers.stamp,
        showLineWhenEmpty: true,
        textDark: exports.CLINICAL_PDF.textDark,
        textMuted: exports.CLINICAL_PDF.textMuted,
        border: exports.CLINICAL_PDF.border,
    });
}
/** Rodapé de validação PetMi Hub (QR + código + hash + disclaimers). */
async function drawValidationFooter(doc, validation, opts) {
    const { margin, pageW } = opts;
    let y = opts.y;
    if (y > doc.page.height - 200) {
        doc.addPage();
        y = margin;
    }
    else {
        y += 28;
    }
    doc
        .moveTo(margin, y)
        .lineTo(doc.page.width - margin, y)
        .strokeColor('#cccccc')
        .lineWidth(0.5)
        .stroke();
    y += 12;
    doc
        .font('Helvetica-Bold')
        .fontSize(10)
        .fillColor(exports.CLINICAL_PDF.textDark)
        .text('Validação PetMi Hub', margin, y);
    y = doc.y + 8;
    const qrSize = 72;
    let qrBuffer = null;
    try {
        qrBuffer = await qrcode_1.default.toBuffer(validation.public_url, { type: 'png', margin: 1, width: qrSize });
    }
    catch {
        qrBuffer = null;
    }
    const metaX = margin + (qrBuffer ? qrSize + 14 : 0);
    const metaW = pageW - (qrBuffer ? qrSize + 14 : 0);
    if (qrBuffer) {
        doc.image(qrBuffer, margin, y, { width: qrSize, height: qrSize });
    }
    doc.font('Helvetica').fontSize(9).fillColor(exports.CLINICAL_PDF.textMuted).text('Código', metaX, y);
    doc
        .font('Helvetica-Bold')
        .fontSize(11)
        .fillColor(exports.CLINICAL_PDF.textDark)
        .text(validation.validation_code, metaX, y + 12);
    doc
        .font('Helvetica')
        .fontSize(8)
        .fillColor(exports.CLINICAL_PDF.textMuted)
        .text(`Integridade: ${truncateHash(validation.content_hash)}`, metaX, y + 30, { width: metaW });
    const validity = validation.expires_at
        ? `Válida até ${new Date(validation.expires_at).toLocaleDateString('pt-BR')}`
        : `Emitida em ${new Date(validation.issued_at).toLocaleString('pt-BR')}`;
    doc.font('Helvetica').fontSize(8).fillColor(exports.CLINICAL_PDF.textMuted).text(validity, metaX, y + 44, {
        width: metaW,
    });
    doc
        .font('Helvetica')
        .fontSize(7)
        .fillColor(exports.CLINICAL_PDF.textMuted)
        .text(validation.public_url, metaX, y + 58, { width: metaW });
    y = Math.max(y + (qrBuffer ? qrSize : 70), doc.y) + 12;
    doc.font('Helvetica').fontSize(7).fillColor(exports.CLINICAL_PDF.textMuted);
    for (const line of validation.disclaimers) {
        doc.text(`• ${line}`, margin, y, { width: pageW });
        y = doc.y + 2;
    }
}
