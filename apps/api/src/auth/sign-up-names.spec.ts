import {
  companyDomain,
  nameFromEmail,
  workspaceNameFromEmail,
} from './sign-up-names.js';

describe('names from an email', () => {
  it('makes a name from the part before the @', () => {
    expect(nameFromEmail('rae.kim@kestrel.io')).toBe('Rae Kim');
    expect(nameFromEmail('RAE_KIM+dossier@kestrel.io')).toBe('Rae Kim');
    expect(nameFromEmail('rae@kestrel.io')).toBe('Rae');
    expect(nameFromEmail('1234@kestrel.io')).toBe('New member');
  });

  it('finds the company’s domain, but not a mail service’s', () => {
    expect(companyDomain('rae@kestrel.io')).toBe('kestrel.io');
    expect(companyDomain('rae@mail.kestrel.io')).toBe('kestrel.io');
    expect(companyDomain('rae@northwind.co.uk')).toBe('northwind.co.uk');
    expect(companyDomain('rae@gmail.com')).toBeNull();
    expect(companyDomain('rae@localhost')).toBeNull();
  });

  it('names the workspace after the company’s domain', () => {
    expect(workspaceNameFromEmail('rae@kestrel-networks.io')).toBe(
      'Kestrel Networks',
    );
    expect(workspaceNameFromEmail('rae@northwind.co.uk')).toBe('Northwind');
    expect(workspaceNameFromEmail('rae@outlook.com')).toBe('My workspace');
  });
});
