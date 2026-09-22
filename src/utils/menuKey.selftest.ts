import { menuKey } from './menuKey';

const names = ['Sup Sorgum Ayam', 'sup-sorgum ayam!', 'Puding Sorgum'];
const keys = names.map(menuKey);

if (keys[0] !== keys[1]) throw new Error('Equivalent menu names must share one key.');
if (keys[0] === keys[2]) throw new Error('Different menu names must retain different keys.');

console.log('menuKey self-test passed');
