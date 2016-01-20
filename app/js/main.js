jQuery(function($) {
	var Layout = {
		goTop: function() {
			var $viewport = $('html, body');

			$('.go-top').on('click', function(e) {
				e.preventDefault();
				$viewport.animate({
					scrollTop: 0
				}, 1500);
			});
		},
		
		jobButtons: function() {
			var el = $('.nav-buttons'),
				actions = $('.actions', el);
			
			el.on('mouseenter', function() {
				actions.stop().slideToggle(250);
			});
			
			el.on('mouseleave', function() {
				actions.stop().slideToggle(250);
			});
		},
		
		init: function() {
			Layout.goTop();	
			
			if ( $('.jobs .nav-buttons').length > 0 ) {
				Layout.jobButtons();
			}
		}
	};
	
	var Slider = {
		
		topicSlider: function() {
			var el = $('.topic-slider'),
				next = $('.nav-topics .next'),
				pagination = $('.topic-slider-pagination'),
				prev = $('.nav-topics .prev');
			
			el.show().royalSlider({
				addActiveClass: true,
				autoHeight: true,
				fadeinLoadedSlide: true,
				loop: true,
				navigateByClick: false,
				slidesSpacing: 0
			});
			
			var slider = el.data('royalSlider');
			
			next.on('click', function() {
				slider.next();
				changeBullet(slider.currSlideId);
				return false;
			});
			
			prev.on('click', function() {
				slider.prev();
				changeBullet(slider.currSlideId);
				return false;
			});
			
			function changeBullet(i) {
				$('.bullet', pagination).removeClass('rsNavSelected');
				$('.bullet', pagination).eq(i).addClass('rsNavSelected');
			}

			function createBullets() {
				var bullet = '',
					bulletsStart = '<ul class="bullets">',
					bulletsEnd = '</ul>';
		
				for ( var i = 0; i < el.data('royalSlider').numSlides; i++ ) {
					bullet = bullet+'<a class="bullet"></a>';
				}				

				pagination.append(bulletsStart+bullet+bulletsEnd);
				$('.bullet:first-of-type', pagination).addClass('rsNavSelected');
				$('.bullet', pagination).on('click', function() {
					changeBullet(slider.currSlideId);
					slider.goTo(slider.currSlideId);
				});
			}
			
			if (el.data('royalSlider').numSlides <= 1) {
				$('.nav-topics, .topic-slider-pagination').hide();
            }
            
            if (el.data('royalSlider').numSlides > 1) {
	            createBullets();
            }
		},
		
		highlightsSlider: function() {
	
			var el = $('#highlights .slider');
	
			el.show().royalSlider({
				addActiveClass: true,
				autoPlay: {
					enabled: true,
					delay: 3500,
					pauseOnHover: true
				},
				autoHeight: true,
				controlNavigation: 'bullets',
				controlNavigationSpacing: 0,
				fadeinLoadedSlide: true,
				imageScaleMode: 'fill',
				loop: true,
				navigateByClick: false,
				slidesSpacing: 0
			});
			
			$('.rsNav').wrap('<div class="outerCont">').parent().append( $('.rsArrow') ).parents('.slider').find('.outerCont');

            if (el.data('royalSlider').numSlides <= 1) {
                $('.rsNav').hide();
            }
		},

		init: function() {
			if ( $('#highlights .slider').length > 0 ) {
				Slider.highlightsSlider();
			}
			
			if ( $('.topic-slider').length > 0 ) {
				Slider.topicSlider();
			}
		}
	};
	
	$(document).ready(function () {
	
		Layout.init();
		Slider.init();
		
	    // js is on
	    $('html').removeClass('no-js');

		
	});
});
