interface Props {
  image: string;
  eyebrow: string;
  title: string;
  description: string;
  tone?: 'teal' | 'ember';
  imagePosition?: string;
}

const toneMap = {
  teal: {
    badge: 'border-[#186073]/40 bg-[#0D2434]/72 text-[#8FD0DF]',
    border: 'border-[#186073]/18',
  },
  ember: {
    badge: 'border-[#D4574A]/30 bg-[#2A1C1A]/72 text-[#F0A596]',
    border: 'border-[#D4574A]/16',
  },
};

export function ImageBanner({
  image,
  eyebrow,
  title,
  description,
  tone = 'teal',
  imagePosition = 'object-[72%_center]',
}: Props): JSX.Element {
  const style = toneMap[tone];

  return (
    <section className={`relative mb-5 overflow-hidden rounded-[12px] border ${style.border} shadow-[0_20px_48px_rgba(15,23,42,0.08)] sm:mb-6 sm:rounded-[14px]`}>
      <div className="absolute inset-0">
        <img src={image} alt="" aria-hidden="true" className={`h-full w-full object-cover ${imagePosition}`} />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(6,16,30,0.94)_0%,rgba(6,16,30,0.88)_34%,rgba(6,16,30,0.48)_100%)]" />
      </div>

      <div className="relative z-10 px-4 py-5 sm:px-6 sm:py-7 md:px-8 md:py-9">
        <span className={`inline-flex rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] ${style.badge}`}>
          {eyebrow}
        </span>
        <h2 className="mt-4 max-w-[620px] text-[22px] font-semibold leading-tight text-white sm:text-[28px] md:text-[34px]">
          {title}
        </h2>
        <p className="mt-3 max-w-[600px] text-[13px] leading-7 text-white/72 md:text-[14px]">
          {description}
        </p>
      </div>
    </section>
  );
}
