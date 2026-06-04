let vetWebUrl = '';

/** Chamado na arranque da app Hub (ex.: `main.tsx`) para links de saída para o PetMi Vet. */
export function setHubUiConfig(config: { vetWebUrl?: string }): void {
  vetWebUrl = (config.vetWebUrl || '').trim();
}

export function getVetWebUrl(): string {
  return vetWebUrl;
}
