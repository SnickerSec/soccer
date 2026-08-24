import {
  parseDelimitedText,
  detectColumns,
  extractPlayersFromFile,
} from '../src/modules/roster-importer.js';

describe('Roster Importer', () => {
  test('parses SportsEngine CSV format with First and Last Name columns', () => {
    const sportsEngineCsv = `First Name,Last Name,Jersey Number,Position,Roster Status
Marcus,Rashford,10,Forward,Active
Bruno,Fernandes,8,Midfield,Active
Luke,Shaw,23,Defense,Active`;

    const result = extractPlayersFromFile(sportsEngineCsv, 'SportsEngine_Roster.csv');
    expect(result.platform).toBe('SportsEngine');
    expect(result.players.length).toBe(3);
    expect(result.players[0]).toEqual({
      name: 'Marcus Rashford',
      number: 10,
      rating: undefined,
      status: 'available',
    });
    expect(result.players[1].name).toBe('Bruno Fernandes');
    expect(result.players[1].number).toBe(8);
  });

  test('parses TeamSnap CSV format', () => {
    const teamSnapCsv = `First Name,Last Name,Jersey Number,Positions,Status
Kai,Havertz,29,Forward,Active
Declan,Rice,41,Midfield,Active`;

    const result = extractPlayersFromFile(teamSnapCsv, 'TeamSnap_Export.csv');
    expect(result.platform).toBe('TeamSnap');
    expect(result.players.length).toBe(2);
    expect(result.players[0].name).toBe('Kai Havertz');
    expect(result.players[0].number).toBe(29);
  });

  test('parses AYSO Sports Connect CSV format', () => {
    const aysoCsv = `Player First Name,Player Last Name,Jersey #,Division,Team
Sophia,Smith,11,10U Girls,Tigers
Trinity,Rodman,2,10U Girls,Tigers`;

    const result = extractPlayersFromFile(aysoCsv, 'AYSO_SportsConnect.csv');
    expect(result.platform).toBe('AYSO Sports Connect');
    expect(result.players.length).toBe(2);
    expect(result.players[0].name).toBe('Sophia Smith');
    expect(result.players[0].number).toBe(11);
  });

  test('parses standard CSV with full name and rating', () => {
    const genericCsv = `Player Name,Number,Rating
Lionel Messi,10,5
Emiliano Martinez,23,4`;

    const result = extractPlayersFromFile(genericCsv, 'roster.csv');
    expect(result.platform).toBe('Generic CSV');
    expect(result.players.length).toBe(2);
    expect(result.players[0].name).toBe('Lionel Messi');
    expect(result.players[0].number).toBe(10);
    expect(result.players[0].rating).toBe(5);
  });

  test('parses plain text roster with numbers', () => {
    const txtRoster = `Alex Morgan #13
Rose Lavelle #16
Crystal Dunn 19`;

    const result = extractPlayersFromFile(txtRoster, 'roster.txt');
    expect(result.platform).toBe('Plain Text Roster');
    expect(result.players.length).toBe(3);
    expect(result.players[0]).toEqual({
      name: 'Alex Morgan',
      number: 13,
      status: 'available',
    });
    expect(result.players[1].number).toBe(16);
    expect(result.players[2].number).toBe(19);
  });

  test('parses JSON format array', () => {
    const jsonRoster = JSON.stringify([
      { name: 'Kylian Mbappe', number: 9 },
      { name: 'Jude Bellingham', number: 5 },
    ]);

    const result = extractPlayersFromFile(jsonRoster, 'team.json');
    expect(result.platform).toBe('JSON Roster');
    expect(result.players.length).toBe(2);
    expect(result.players[0].name).toBe('Kylian Mbappe');
    expect(result.players[0].number).toBe(9);
  });
});
