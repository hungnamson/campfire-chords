import React from 'react';

export default function BrandLogo({ className = "w-6 h-6", variant = "vertical" }) {
  const src = variant === "horizontal" ? "/logo-horizontal.png" : "/logo-vertical.png";
  return (
    <img 
      src={src} 
      alt="HátCùngNhau Logo" 
      className={`${className} object-contain`} 
    />
  );
}
