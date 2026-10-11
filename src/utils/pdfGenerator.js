'use strict';

const puppeteer = require('puppeteer');
const ejs = require('ejs');
const path = require('path');
const fs = require('fs');
let QRCode;
try {
    QRCode = require('qrcode');
} catch (e) {
    QRCode = null;
}
const logger = require('./logger');

/**
 * Helper to convert local image to base64 Data URI
 */
function getAssetAsBase64(relativePaths) {
    for (const relPath of relativePaths) {
        try {
            const fullPath = path.resolve(__dirname, relPath);
            if (fs.existsSync(fullPath)) {
                const ext = path.extname(fullPath).toLowerCase().replace('.', '') || 'png';
                const fileBuf = fs.readFileSync(fullPath);
                return `data:image/${ext === 'svg' ? 'svg+xml' : ext};base64,${fileBuf.toString('base64')}`;
            }
        } catch (e) {
            // continue checking next path
        }
    }
    return null;
}

/**
 * Generates a PDF buffer from an EJS template and data
 * @param {string} templateName - Name of the EJS template (without .ejs extension)
 * @param {object} data - Data to inject into the template
 * @returns {Promise<Buffer>} - The generated PDF as a buffer
 */
async function generatePdf(templateName, data) {
    try {
        const templatePath = path.join(__dirname, '../templates', `${templateName}.ejs`);
        
        // Enrich data for invoice template
        if (templateName === 'invoice') {
            if (!data.companyLogo) {
                data.companyLogo = getAssetAsBase64([
                    '../assets/logo Full Mark.png',
                    '../../temp/logo Full Mark.png',
                    '../assets/Logo PNG.png',
                    '../../temp/Logo PNG.png'
                ]);
            }
            if (!data.signatureImage) {
                data.signatureImage = getAssetAsBase64([
                    '../assets/Signature.png',
                    '../../temp/Signature.png'
                ]);
            }
            if (!data.qrCodeDataUri && QRCode) {
                try {
                    const upiUrl = `upi://pay?pa=WIFTIL@SBI&pn=WIFTIL%20TECHNOLOGY%20PVT%20LTD&am=${(data.totalAmount || 0).toFixed(2)}&cu=INR`;
                    data.qrCodeDataUri = await QRCode.toDataURL(upiUrl, {
                        width: 250,
                        margin: 1,
                        color: {
                            dark: '#00262C',
                            light: '#FFFFFF'
                        }
                    });
                } catch (qrErr) {
                    logger.warn('Failed to generate offline QR code Data URI:', qrErr);
                }
            }
        }

        // Render HTML from EJS template
        const html = await ejs.renderFile(templatePath, data, { async: true });
        
        // Launch Puppeteer
        const browser = await puppeteer.launch({
            headless: 'new',
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        
        const page = await browser.newPage();
        
        // Set viewport to standard A4 aspect
        await page.setViewport({ width: 794, height: 1123, deviceScaleFactor: 2 });

        // Set the HTML content
        await page.setContent(html, { waitUntil: 'networkidle0' });
        
        // Generate PDF
        const pdfBuffer = await page.pdf({
            format: 'A4',
            printBackground: true,
            preferCSSPageSize: true,
            margin: {
                top: '0px',
                right: '0px',
                bottom: '0px',
                left: '0px'
            }
        });
        
        await browser.close();
        return pdfBuffer;
    } catch (error) {
        logger.error('Error generating PDF:', error);
        throw error;
    }
}

/**
 * Helper to convert number to words (for invoice total amount)
 * Indian numbering system: crore, lakh, thousand, hundred
 */
function numberToWords(num) {
    const a = ['', 'one ', 'two ', 'three ', 'four ', 'five ', 'six ', 'seven ', 'eight ', 'nine ', 'ten ', 'eleven ', 'twelve ', 'thirteen ', 'fourteen ', 'fifteen ', 'sixteen ', 'seventeen ', 'eighteen ', 'nineteen '];
    const b = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

    if ((num = num.toString()).length > 9) return 'overflow';
    const n = ('000000000' + num).substr(-9).match(/^(\d{2})(\d{2})(\d{2})(\d{1})(\d{2})$/);
    if (!n) return '';
    let str = '';
    str += (n[1] != 0) ? (a[Number(n[1])] || b[n[1][0]] + ' ' + a[n[1][1]]) + 'crore ' : '';
    str += (n[2] != 0) ? (a[Number(n[2])] || b[n[2][0]] + ' ' + a[n[2][1]]) + 'lakh ' : '';
    str += (n[3] != 0) ? (a[Number(n[3])] || b[n[3][0]] + ' ' + a[n[3][1]]) + 'thousand ' : '';
    str += (n[4] != 0) ? (a[Number(n[4])] || b[n[4][0]] + ' ' + a[n[4][1]]) + 'hundred ' : '';
    str += (n[5] != 0) ? ((str != '') ? 'and ' : '') + (a[Number(n[5])] || b[n[5][0]] + ' ' + a[n[5][1]]) : '';
    return str.trim();
}

module.exports = {
    generatePdf,
    numberToWords
};
