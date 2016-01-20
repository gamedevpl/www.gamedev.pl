head.js('http://code.jquery.com/jquery-1.11.1.min.js', function() {

		if ($('select').length > 0) {

			head.js('/js/jquery.selectbox-0.2.min.js', function() {
				$('select').selectbox();
			});
		}
		
		if ($(".slider").size()>0) {
			head.js('/js/jquery.royalslider.custom.min.js')
				.load('css/royalslider.css');
		}
	})
	.js('https://cdnjs.cloudflare.com/ajax/libs/modernizr/2.8.3/modernizr.js')
	.js('/js/min/main-min.js');
	//.js('/js/main.js')
	

if (head.browser.ie && parseFloat(head.browser.version) < 9) {
    head.js('https://cdnjs.cloudflare.com/ajax/libs/html5shiv/3.7.3/html5shiv.min.js')
    	.js('https://cdnjs.cloudflare.com/ajax/libs/selectivizr/1.0.2/selectivizr-min.js')
    	.js('https://cdnjs.cloudflare.com/ajax/libs/respond.js/1.4.2/respond.min.js');
}
