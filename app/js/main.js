function debouncer( func , timeout ) {
   var timeoutID , timeout = timeout || 200;
   return function () {
      var scope = this , args = arguments;
      clearTimeout( timeoutID );
      timeoutID = setTimeout( function () {
          func.apply( scope , Array.prototype.slice.call( args ) );
      } , timeout );
   }
}

var init = function() {
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
	
	var Nav = {
		mobileNav: function() {
			var b = $('body'),
			 	h = $('#header').height(),
			 	mm = $('#main-menu'),
			 	windowpos,
			 	ww = $(window).width();
			 	console.log(ww);

			function fixNav() {
				windowpos = $(window).scrollTop();
				
				if (ww <= 640) {
					if (windowpos >= h) {
						b.addClass("fixed");
					} else {
						b.removeClass("fixed");
					}
				}
				
				$(window).on('scroll', function() {					    
				    windowpos = $(window).scrollTop();
					ww = $(window).width();
					
					if (ww <= 640) { 
						if (windowpos >= h) {
							b.addClass("fixed");
							
						} else {
							b.removeClass("fixed");
						}
					}
				});				
			}
			
			function showHide() {
				var e = $('.nav-trigger');
				
				e.on('click', function(e) {
					e.preventDefault();
					
					mm.toggleClass('opened');
				});
				
				$(window).on('resize', function() {
					ww = $(window).width();
					
					if (ww > 640) { 
						mm.removeClass('opened');
					}
				});
			}
			
			fixNav();
			showHide();
		},		
		
		init: function() {
			Nav.mobileNav();
		}
	}
	
	var Rwd = {
	
		forumTitle: function(ww) {			
			if ($('.content-list.forum').length > 0) {
			
				var e = $('.content-list.forum'),
					long_name = $('h3', e).attr('data-long');
					short_name = $('h3', e).attr('data-short');

				if (ww <= 480) {
					$('h3', e).html(short_name);
				} else {
					$('h3', e).html(long_name);
				}
			}
		},
		
		loginButton: function(ww) {
			if ( $('#top-bar').hasClass('not-logged')) {
				var e = $('.btn.login');

				if ($('.btn.login').length > 0) {
					if (ww < 1024) {
						e.detach();
						$('#header').append(e);
	
					} else {
						e.detach();
						$('#top-bar .welcome').after(e);
					}
				}
			}
		},

		mainMenu: function(ww) {
			var e = $('#main-menu');

			if (ww < 1024) {
				e.detach();
				$('#header').after(e);

			} else {
				e.detach();
				$('#header').append(e);
			}			
		},
		
		highlightsVideo: function(ww) {
			if (('#highlights .video').length > 0) {
				var e = $('#highlights .video');
	
				if (ww <= 1024) {
					e.detach();
					$('.content-list.jobs').after(e);
	
				} else {
					e.detach();
					$('#highlights .highlights').after(e);
				}
			}
		},
		
		init: function() {
			var ww = $(window).width();
			
			Rwd.forumTitle(ww);
			Rwd.highlightsVideo(ww);
			Rwd.loginButton(ww);
			Rwd.mainMenu(ww);
		
			$(window).resize( debouncer( function(e) {
				ww = $(window).width();
	
				Rwd.forumTitle(ww);
				Rwd.highlightsVideo(ww);
				Rwd.loginButton(ww);
				Rwd.mainMenu(ww);
			}));
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
	
		Layout.init();
		Nav.init();
		Slider.init();
		Rwd.init();
		
	    // js is on
    $('html').removeClass('no-js');
};

init();