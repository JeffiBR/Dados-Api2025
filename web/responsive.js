// responsive.js - Sistema inteligente de responsividade
class ResponsiveManager {
    constructor() {
        this.currentBreakpoint = this.getBreakpoint();
        this.init();
    }

    getBreakpoint() {
        const width = window.innerWidth;
        if (width <= 360) return 'xs';
        if (width <= 480) return 'sm';
        if (width <= 768) return 'md';
        if (width <= 1024) return 'lg';
        return 'xl';
    }

    getOrientation() {
        return window.innerHeight > window.innerWidth ? 'portrait' : 'landscape';
    }

    adjustLayout() {
        const breakpoint = this.getBreakpoint();
        const orientation = this.getOrientation();
        
        // Aplicar classes específicas no body
        document.body.className = document.body.className.replace(/\bbreakpoint-\w+\b/g, '');
        document.body.className = document.body.className.replace(/\borientation-\w+\b/g, '');
        
        document.body.classList.add(`breakpoint-${breakpoint}`);
        document.body.classList.add(`orientation-${orientation}`);

        // Ajustes específicos por breakpoint
        this.applyBreakpointSpecifics(breakpoint, orientation);
    }

    applyBreakpointSpecifics(breakpoint, orientation) {
        // Ajustar tamanho de fontes
        this.adjustTypography(breakpoint);
        
        // Ajustar espaçamentos
        this.adjustSpacing(breakpoint);
        
        // Ajustar grid de resultados
        this.adjustResultsGrid(breakpoint);
        
        // Ajustar filtros
        this.adjustFilters(breakpoint, orientation);
    }

    adjustTypography(breakpoint) {
        const multipliers = {
            'xs': 0.85,
            'sm': 0.9,
            'md': 0.95,
            'lg': 1,
            'xl': 1
        };
        
        const multiplier = multipliers[breakpoint];
        document.documentElement.style.fontSize = `${multiplier * 100}%`;
    }

    adjustSpacing(breakpoint) {
        const spacing = {
            'xs': '0.5rem',
            'sm': '0.75rem',
            'md': '1rem',
            'lg': '1.25rem',
            'xl': '1.5rem'
        };
        
        document.documentElement.style.setProperty('--spacing-unit', spacing[breakpoint]);
    }

    adjustResultsGrid(breakpoint) {
        const gridColumns = {
            'xs': 1,
            'sm': 1,
            'md': 2,
            'lg': 3,
            'xl': 4
        };
        
        const resultsGrid = document.getElementById('resultsGrid');
        if (resultsGrid) {
            resultsGrid.style.gridTemplateColumns = `repeat(auto-fill, minmax(280px, 1fr))`;
        }
    }

    adjustFilters(breakpoint, orientation) {
        const filtersDetails = document.getElementById('filters-details');
        if (filtersDetails && breakpoint === 'xs') {
            // Fechar filtros automaticamente em telas muito pequenas
            filtersDetails.open = false;
        }
    }

    init() {
        // Ajustar layout inicial
        this.adjustLayout();

        // Ajustar ao redimensionar
        window.addEventListener('resize', () => {
            const newBreakpoint = this.getBreakpoint();
            if (newBreakpoint !== this.currentBreakpoint) {
                this.currentBreakpoint = newBreakpoint;
                this.adjustLayout();
            }
        });

        // Ajustar ao mudar orientação
        window.addEventListener('orientationchange', () => {
            setTimeout(() => this.adjustLayout(), 100);
        });

        // Prevenir zoom duplo-tap em iOS
        let lastTouchEnd = 0;
        document.addEventListener('touchend', (event) => {
            const now = Date.now();
            if (now - lastTouchEnd <= 300) {
                event.preventDefault();
            }
            lastTouchEnd = now;
        }, false);
    }
}

// Inicializar quando DOM estiver pronto
document.addEventListener('DOMContentLoaded', () => {
    new ResponsiveManager();
});

// Utilitários para outros scripts
window.getCurrentBreakpoint = () => {
    const width = window.innerWidth;
    if (width <= 360) return 'xs';
    if (width <= 480) return 'sm';
    if (width <= 768) return 'md';
    if (width <= 1024) return 'lg';
    return 'xl';
};

window.isTouchDevice = () => {
    return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
};
