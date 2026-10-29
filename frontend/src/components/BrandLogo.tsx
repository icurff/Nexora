type BrandLogoProps = {
  className?: string;
};

export function BrandLogo({ className }: BrandLogoProps) {
  return (
    <img
      src="/nexora-logo.png"
      alt="Nexora"
      className={className ? `brand-logo ${className}` : 'brand-logo'}
    />
  );
}
