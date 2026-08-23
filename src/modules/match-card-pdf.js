import { loadPdfLibraries } from './evaluation-pdf';

/**
 * Generates an official printable AYSO Match Lineup Card PDF.
 * Designed for AYSO coaches and referees: includes team details,
 * 4-quarter player rotation matrix, goalkeepers, captains, and referee sign-off.
 */
export async function generateMatchCardPdf({
  lineup,
  players = [],
  captains = [],
  teamName = 'AYSO Team',
  opponentName = 'Opponent',
  date = new Date().toLocaleDateString(),
  ageDivision = '10U',
  coachName = '',
  field = '',
}) {
  await loadPdfLibraries();
  const { PDFDocument, rgb, StandardFonts } = window.PDFLib;

  const pdfDoc = await PDFDocument.create();
  // Standard Letter page in portrait: 612 x 792 points
  const page = pdfDoc.addPage([612, 792]);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  // Palette
  const navy = rgb(0.08, 0.18, 0.36);
  const darkSlate = rgb(0.12, 0.16, 0.22);
  const mutedGray = rgb(0.45, 0.52, 0.60);
  const lightBg = rgb(0.95, 0.96, 0.98);
  const gold = rgb(0.85, 0.65, 0.13);
  const green = rgb(0.10, 0.55, 0.25);
  const borderGray = rgb(0.80, 0.84, 0.88);

  const cleanText = (str) =>
    (str || '').replace(/[^\x20-\x7E]/g, '').trim();

  // 1. Header Banner
  page.drawRectangle({
    x: 36,
    y: 720,
    width: 540,
    height: 44,
    color: navy,
  });

  page.drawText('AYSO OFFICIAL MATCH LINEUP CARD', {
    x: 50,
    y: 742,
    size: 14,
    font: boldFont,
    color: rgb(1, 1, 1),
  });

  page.drawText('EVERYONE PLAYS® • SAFE, FAIR, FUN', {
    x: 50,
    y: 728,
    size: 8,
    font: boldFont,
    color: gold,
  });

  page.drawText(`Division: ${cleanText(ageDivision)}`, {
    x: 480,
    y: 736,
    size: 11,
    font: boldFont,
    color: rgb(1, 1, 1),
  });

  // 2. Match Details Box
  page.drawRectangle({
    x: 36,
    y: 650,
    width: 540,
    height: 60,
    borderColor: borderGray,
    borderWidth: 1,
    color: lightBg,
  });

  // Row 1 of details
  page.drawText('Team Name:', { x: 46, y: 692, size: 8, font: boldFont, color: mutedGray });
  page.drawText(cleanText(teamName) || 'Our Team', { x: 105, y: 692, size: 9, font: boldFont, color: darkSlate });

  page.drawText('Opponent:', { x: 230, y: 692, size: 8, font: boldFont, color: mutedGray });
  page.drawText(cleanText(opponentName) || 'Opponent', { x: 280, y: 692, size: 9, font: font, color: darkSlate });

  page.drawText('Date:', { x: 420, y: 692, size: 8, font: boldFont, color: mutedGray });
  page.drawText(cleanText(date), { x: 450, y: 692, size: 9, font: font, color: darkSlate });

  // Row 2 of details
  page.drawText('Head Coach:', { x: 46, y: 664, size: 8, font: boldFont, color: mutedGray });
  page.drawText(cleanText(coachName) || 'Coach', { x: 105, y: 664, size: 9, font: font, color: darkSlate });

  page.drawText('Field # / Park:', { x: 230, y: 664, size: 8, font: boldFont, color: mutedGray });
  page.drawText(cleanText(field) || 'Main Field', { x: 295, y: 664, size: 9, font: font, color: darkSlate });

  page.drawText('Formation:', { x: 420, y: 664, size: 8, font: boldFont, color: mutedGray });
  page.drawText(cleanText(lineup.formation || 'Standard'), { x: 475, y: 664, size: 9, font: font, color: darkSlate });

  // 3. Lineup Matrix Table
  const tableTop = 625;
  const colX = {
    num: 46,
    name: 75,
    capt: 215,
    q1: 255,
    q2: 310,
    q3: 365,
    q4: 420,
    played: 475,
    goals: 520,
  };

  // Table Header
  page.drawRectangle({
    x: 36,
    y: tableTop,
    width: 540,
    height: 18,
    color: rgb(0.88, 0.91, 0.95),
  });

  page.drawText('#', { x: colX.num, y: tableTop + 5, size: 8, font: boldFont, color: darkSlate });
  page.drawText('PLAYER NAME', { x: colX.name, y: tableTop + 5, size: 8, font: boldFont, color: darkSlate });
  page.drawText('CAPT', { x: colX.capt, y: tableTop + 5, size: 8, font: boldFont, color: darkSlate });
  page.drawText('Q1 POS', { x: colX.q1, y: tableTop + 5, size: 8, font: boldFont, color: darkSlate });
  page.drawText('Q2 POS', { x: colX.q2, y: tableTop + 5, size: 8, font: boldFont, color: darkSlate });
  page.drawText('Q3 POS', { x: colX.q3, y: tableTop + 5, size: 8, font: boldFont, color: darkSlate });
  page.drawText('Q4 POS', { x: colX.q4, y: tableTop + 5, size: 8, font: boldFont, color: darkSlate });
  page.drawText('PLAYED', { x: colX.played, y: tableTop + 5, size: 8, font: boldFont, color: darkSlate });
  page.drawText('GOALS', { x: colX.goals, y: tableTop + 5, size: 8, font: boldFont, color: darkSlate });

  // Roster Rows
  const rosterList = (lineup.playerStats && lineup.playerStats.length > 0)
    ? lineup.playerStats
    : players;

  const rowHeight = 21;
  let currentY = tableTop;

  rosterList.forEach((player, idx) => {
    currentY -= rowHeight;
    const isEven = idx % 2 === 0;

    // Row zebra background
    if (!isEven) {
      page.drawRectangle({
        x: 36,
        y: currentY,
        width: 540,
        height: rowHeight,
        color: rgb(0.97, 0.98, 0.99),
      });
    }

    // Row border line
    page.drawLine({
      start: { x: 36, y: currentY },
      end: { x: 576, y: currentY },
      color: borderGray,
      thickness: 0.5,
    });

    const isCapt = captains.includes(player.name) || player.isCaptain;
    const pNumber = player.number != null ? String(player.number) : '-';
    const quarters = lineup.quarters || [];

    // Find position in each quarter
    const getQuarterPos = (qIndex) => {
      const q = quarters[qIndex];
      if (!q) return '-';
      for (const [pos, pVal] of Object.entries(q.positions || {})) {
        const name = typeof pVal === 'string' ? pVal : pVal?.name;
        if (name === player.name) return pos === 'Keeper' ? 'GK [K]' : pos.slice(0, 7);
      }
      return 'Rest';
    };

    const q1Pos = getQuarterPos(0);
    const q2Pos = getQuarterPos(1);
    const q3Pos = getQuarterPos(2);
    const q4Pos = getQuarterPos(3);

    const playedCount = [q1Pos, q2Pos, q3Pos, q4Pos].filter((p) => p !== 'Rest' && p !== '-').length;

    // Jersey number & name
    page.drawText(pNumber, { x: colX.num, y: currentY + 6, size: 9, font: boldFont, color: darkSlate });
    page.drawText(cleanText(player.name), {
      x: colX.name,
      y: currentY + 6,
      size: 9,
      font: isCapt ? boldFont : font,
      color: isCapt ? navy : darkSlate,
    });

    // Captain
    if (isCapt) {
      page.drawText('[CAPT]', { x: colX.capt, y: currentY + 6, size: 8, font: boldFont, color: gold });
    }

    // Quarters
    [q1Pos, q2Pos, q3Pos, q4Pos].forEach((pos, qIdx) => {
      const qColKey = `q${qIdx + 1}`;
      const isGK = pos.includes('GK');
      const isRest = pos === 'Rest';

      page.drawText(pos, {
        x: colX[qColKey],
        y: currentY + 6,
        size: 8,
        font: isGK ? boldFont : font,
        color: isGK ? green : isRest ? mutedGray : darkSlate,
      });
    });

    // Total Played quarters
    page.drawText(`${playedCount} / 4`, {
      x: colX.played + 4,
      y: currentY + 6,
      size: 8,
      font: boldFont,
      color: playedCount >= 2 ? green : rgb(0.8, 0.2, 0.2),
    });

    // Goals box (empty for referee / coach recording)
    page.drawRectangle({
      x: colX.goals + 2,
      y: currentY + 3,
      width: 24,
      height: 14,
      borderColor: borderGray,
      borderWidth: 0.5,
    });
  });

  // Table bounding border
  page.drawRectangle({
    x: 36,
    y: currentY,
    width: 540,
    height: tableTop + 18 - currentY,
    borderColor: borderGray,
    borderWidth: 1,
  });

  // 4. Fair Play Certification & Rule Compliance Seal
  const certY = currentY - 50;
  page.drawRectangle({
    x: 36,
    y: certY,
    width: 540,
    height: 42,
    color: rgb(0.93, 0.97, 0.94),
    borderColor: rgb(0.65, 0.85, 0.70),
    borderWidth: 1,
  });

  page.drawText('AYSO FAIR PLAY COMPLIANCE VERIFICATION', {
    x: 48,
    y: certY + 26,
    size: 8.5,
    font: boldFont,
    color: green,
  });

  page.drawText(
    'All active players play at least 50% of the game. No player sits two quarters before every player plays three.',
    {
      x: 48,
      y: certY + 12,
      size: 7.5,
      font: font,
      color: rgb(0.15, 0.35, 0.20),
    }
  );

  // 5. Referee & Game Sign-Off Section
  const refY = certY - 110;
  page.drawRectangle({
    x: 36,
    y: refY,
    width: 540,
    height: 100,
    borderColor: borderGray,
    borderWidth: 1,
    color: rgb(0.99, 0.99, 1.0),
  });

  page.drawText('OFFICIAL REFEREE MATCH REPORT', {
    x: 48,
    y: refY + 84,
    size: 9,
    font: boldFont,
    color: navy,
  });

  // Final Score Box
  page.drawText('FINAL SCORE:', { x: 48, y: refY + 62, size: 8, font: boldFont, color: mutedGray });
  page.drawText(`${cleanText(teamName)}: _____`, { x: 120, y: refY + 62, size: 9, font: boldFont, color: darkSlate });
  page.drawText(`${cleanText(opponentName)}: _____`, { x: 260, y: refY + 62, size: 9, font: boldFont, color: darkSlate });

  // Signatures
  page.drawText('Center Referee Signature:', { x: 48, y: refY + 36, size: 8, font: boldFont, color: mutedGray });
  page.drawLine({ start: { x: 175, y: refY + 36 }, end: { x: 330, y: refY + 36 }, color: borderGray, thickness: 1 });

  page.drawText('Assistant Ref 1:', { x: 350, y: refY + 36, size: 8, font: boldFont, color: mutedGray });
  page.drawLine({ start: { x: 425, y: refY + 36 }, end: { x: 555, y: refY + 36 }, color: borderGray, thickness: 1 });

  page.drawText('Coach Signature:', { x: 48, y: refY + 14, size: 8, font: boldFont, color: mutedGray });
  page.drawLine({ start: { x: 140, y: refY + 14 }, end: { x: 330, y: refY + 14 }, color: borderGray, thickness: 1 });

  page.drawText('Assistant Ref 2:', { x: 350, y: refY + 14, size: 8, font: boldFont, color: mutedGray });
  page.drawLine({ start: { x: 425, y: refY + 14 }, end: { x: 555, y: refY + 14 }, color: borderGray, thickness: 1 });

  // 6. Footer
  page.drawText(
    `Generated by AYSO Roster Pro (aysoroster.com) • ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`,
    {
      x: 36,
      y: 22,
      size: 7,
      font: font,
      color: mutedGray,
    }
  );

  const pdfBytes = await pdfDoc.save();
  const blob = new Blob([pdfBytes], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  const safeFilename = `${(teamName || 'AYSO').replace(/[^a-zA-Z0-9]/g, '_')}_Match_Card.pdf`;
  link.download = safeFilename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
