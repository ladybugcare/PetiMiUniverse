import React from 'react';

/** Categoria da demanda + passo inicial sem categoria escolhida */
export type CreateDemandHeroCategory = 'vet' | 'freelancer' | 'clinic' | 'other' | 'select';

const THEME: Record<
  CreateDemandHeroCategory,
  {
    gradient: string;
    accent: string;
    badgeBorder: string;
    image: string;
  }
> = {
  select: {
    gradient: 'linear-gradient(105deg, #fce7f3 0%, #fff1f2 40%, #ffffff 100%)',
    accent: '#be185d',
    badgeBorder: 'rgba(190, 24, 93, 0.45)',
    image: '/demand-heroes/category-select.png',
  },
  vet: {
    gradient: 'linear-gradient(105deg, #ede9fe 0%, #f5f3ff 42%, #ffffff 100%)',
    accent: '#5b21b6',
    badgeBorder: 'rgba(91, 33, 182, 0.4)',
    image: '/demand-heroes/vet.png',
  },
  freelancer: {
    gradient: 'linear-gradient(105deg, #fce7f3 0%, #fff1f2 42%, #ffffff 100%)',
    accent: '#be185d',
    badgeBorder: 'rgba(190, 24, 93, 0.45)',
    image: '/demand-heroes/freelancer.png',
  },
  clinic: {
    gradient: 'linear-gradient(105deg, #e0f2fe 0%, #f0f9ff 45%, #ffffff 100%)',
    accent: '#0369a1',
    badgeBorder: 'rgba(3, 105, 161, 0.4)',
    image: '/demand-heroes/clinic.png',
  },
  other: {
    gradient: 'linear-gradient(105deg, #d1fae5 0%, #ecfdf5 45%, #ffffff 100%)',
    accent: '#047857',
    badgeBorder: 'rgba(4, 120, 87, 0.4)',
    image: '/demand-heroes/other.png',
  },
};

/** Largura e padding horizontais alinhados ao formulário (DemandFormStep). */
const CONTAINED_MAX = '1180px';
const CONTAINED_PAD = '20px';

export interface CreateDemandHeroProps {
  category: CreateDemandHeroCategory;
  title: string;
  subtitle: string;
  /** Texto pequeno em maiúsculas à esquerda (ex.: Nova demanda, Revisão) */
  eyebrow?: string;
  /** Rótulo da pastilha; omitir ou null para não mostrar */
  badge?: string | null;
  /**
   * Quando true, o bloco (texto + imagem) não ocupa 100% do viewport:
   * fica centrado com a mesma largura máxima e margens que o conteúdo abaixo.
   */
  contained?: boolean;
}

/**
 * Cabeçalho em duas colunas (texto + um cão) para o fluxo criar demanda.
 * Degradê suave e cor de destaque por categoria; imagem em /public/demand-heroes/.
 */
const CreateDemandHero: React.FC<CreateDemandHeroProps> = ({
  category,
  title,
  subtitle,
  eyebrow = 'Nova demanda',
  badge,
  contained = false,
}) => {
  const t = THEME[category];

  const shell = (
    <div
      style={{
        ...styles.shell,
        background: t.gradient,
        ...(contained ? styles.shellContained : {}),
      }}
    >
      <div style={styles.decorSoft} aria-hidden />
      <div style={styles.decorPaws} aria-hidden />
      <div style={styles.inner}>
        <div style={styles.textCol}>
          <div style={styles.topRow}>
            <span style={{ ...styles.eyebrow, color: t.accent }}>{eyebrow}</span>
            {badge != null && badge !== '' && (
              <span
                style={{
                  ...styles.badge,
                  color: t.accent,
                  borderColor: t.badgeBorder,
                }}
              >
                {badge}
              </span>
            )}
          </div>
          <h1 style={styles.title}>{title}</h1>
          <p style={styles.subtitle}>{subtitle}</p>
        </div>
        <div style={styles.imageCol}>
          <img
            src={t.image}
            alt=""
            style={styles.heroImg}
            decoding="async"
          />
        </div>
      </div>
    </div>
  );

  if (contained) {
    return <div style={styles.containedOuter}>{shell}</div>;
  }

  return shell;
};

const styles: { [key: string]: React.CSSProperties } = {
  containedOuter: {
    maxWidth: CONTAINED_MAX,
    marginLeft: 'auto',
    marginRight: 'auto',
    paddingLeft: CONTAINED_PAD,
    paddingRight: CONTAINED_PAD,
    boxSizing: 'border-box',
    marginBottom: '16px',
  },
  shell: {
    position: 'relative',
    overflow: 'hidden',
    borderRadius: '16px 16px 0 0',
  },
  shellContained: {
    borderRadius: '16px',
    boxShadow: '0 2px 14px rgba(15, 23, 42, 0.06)',
  },
  decorSoft: {
    position: 'absolute',
    inset: 0,
    background:
      'radial-gradient(ellipse 70% 55% at 100% 100%, rgba(255,255,255,0.65) 0%, transparent 55%)',
    pointerEvents: 'none',
  },
  decorPaws: {
    position: 'absolute',
    inset: 0,
    opacity: 0.06,
    backgroundImage: `repeating-linear-gradient(
      -12deg,
      transparent,
      transparent 40px,
      rgba(0, 0, 0, 0.04) 40px,
      rgba(0, 0, 0, 0.04) 41px
    )`,
    pointerEvents: 'none',
  },
  inner: {
    position: 'relative',
    zIndex: 1,
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: '24px 32px',
    padding: '36px 36px 0 40px',
    minHeight: '200px',
  },
  textCol: {
    flex: '1 1 280px',
    minWidth: 0,
    paddingBottom: '36px',
    maxWidth: '560px',
  },
  topRow: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: '12px',
    marginBottom: '14px',
  },
  eyebrow: {
    fontFamily: 'Inter, sans-serif',
    fontSize: '11px',
    fontWeight: 700,
    letterSpacing: '0.18em',
    textTransform: 'uppercase',
  },
  badge: {
    fontFamily: 'Inter, sans-serif',
    fontSize: '12px',
    fontWeight: 600,
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
    padding: '5px 12px',
    borderRadius: '999px',
    border: '1px solid',
    backgroundColor: 'rgba(255, 255, 255, 0.55)',
  },
  title: {
    fontFamily: 'Poppins, sans-serif',
    fontSize: 'clamp(1.35rem, 2.4vw, 1.75rem)',
    fontWeight: 700,
    lineHeight: 1.25,
    color: '#1c1917',
    margin: '0 0 10px 0',
  },
  subtitle: {
    fontFamily: 'Inter, sans-serif',
    fontSize: '15px',
    lineHeight: 1.6,
    color: '#57534e',
    margin: 0,
  },
  imageCol: {
    flex: '0 1 260px',
    display: 'flex',
    alignItems: 'flex-end',
    justifyContent: 'center',
    minHeight: '160px',
    marginLeft: 'auto',
  },
  heroImg: {
    display: 'block',
    width: '100%',
    maxWidth: 'min(280px, 42vw)',
    height: 'auto',
    maxHeight: '220px',
    objectFit: 'contain',
    objectPosition: 'bottom center',
    filter: 'drop-shadow(8px 12px 20px rgba(15, 23, 42, 0.12))',
  },
};

export default CreateDemandHero;
