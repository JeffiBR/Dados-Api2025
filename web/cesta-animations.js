// cesta-animations.js - Efeitos e animações adicionais
document.addEventListener('DOMContentLoaded', function() {
    // Observador de interseção para animações ao scroll
    const observerOptions = {
        threshold: 0.1,
        rootMargin: '0px 0px -50px 0px'
    };

    const observer = new IntersectionObserver(function(entries) {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.style.animationPlayState = 'running';
                observer.unobserve(entry.target);
            }
        });
    }, observerOptions);

    // Aplicar observador a todos os cards
    document.querySelectorAll('.market-card').forEach(card => {
        card.style.animation = 'fadeInUp 0.8s ease-out backwards';
        card.style.animationPlayState = 'paused';
        observer.observe(card);
    });

    // Efeito de digitação para títulos
    const typeWriter = (element, text, speed = 50) => {
        let i = 0;
        element.innerHTML = '';
        const timer = setInterval(() => {
            if (i < text.length) {
                element.innerHTML += text.charAt(i);
                i++;
            } else {
                clearInterval(timer);
            }
        }, speed);
    };

    // Aplicar efeito de digitação aos títulos principais
    const mainTitles = document.querySelectorAll('.results-section h3');
    mainTitles.forEach(title => {
        const originalText = title.textContent;
        typeWriter(title, originalText, 30);
    });

    // Efeito de confete para a melhor cesta
    function createConfetti() {
        const confettiCount = 50;
        const confettiContainer = document.createElement('div');
        confettiContainer.style.position = 'fixed';
        confettiContainer.style.top = '0';
        confettiContainer.style.left = '0';
        confettiContainer.style.width = '100%';
        confettiContainer.style.height = '100%';
        confettiContainer.style.pointerEvents = 'none';
        confettiContainer.style.zIndex = '9999';
        
        for (let i = 0; i < confettiCount; i++) {
            const confetti = document.createElement('div');
            confetti.style.position = 'absolute';
            confetti.style.width = '10px';
            confetti.style.height = '10px';
            confetti.style.background = `hsl(${Math.random() * 360}, 100%, 50%)`;
            confetti.style.borderRadius = '50%';
            confetti.style.top = '0';
            confetti.style.left = `${Math.random() * 100}%`;
            confetti.style.animation = `confettiFall ${Math.random() * 3 + 2}s linear forwards`;
            confettiContainer.appendChild(confetti);
        }
        
        document.body.appendChild(confettiContainer);
        
        setTimeout(() => {
            confettiContainer.remove();
        }, 3000);
    }

    // Adicionar confetti ao clicar na melhor cesta
    document.addEventListener('click', function(e) {
        if (e.target.closest('.market-card.cheapest') || 
            e.target.closest('.market-card.complete-basket')) {
            createConfetti();
        }
    });
});

// Adicionar CSS para animação de confetti
const confettiStyle = document.createElement('style');
confettiStyle.textContent = `
    @keyframes confettiFall {
        0% {
            transform: translateY(-100px) rotate(0deg);
            opacity: 1;
        }
        100% {
            transform: translateY(100vh) rotate(360deg);
            opacity: 0;
        }
    }
`;
document.head.appendChild(confettiStyle);
