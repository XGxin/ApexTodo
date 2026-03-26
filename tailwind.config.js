module.exports = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        glass: 'rgba(255,255,255,0.08)',
        border: 'rgba(255,255,255,0.25)'
      },
      boxShadow: {
        glow: '0 12px 40px rgba(4, 22, 34, 0.35)'
      },
      transitionTimingFunction: {
        smooth: 'ease-in-out'
      }
    }
  },
  plugins: []
};
