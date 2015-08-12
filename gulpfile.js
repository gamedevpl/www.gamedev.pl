var concat = require('gulp-concat');
var ext_replace = require('gulp-ext-replace');
var gulp = require('gulp');
var mustache = require("gulp-mustache");
var less = require('gulp-less');
var path = require('path');
var rename = require("gulp-rename");
var rm = require('gulp-rm')
var run = require('gulp-run');
var serve = require('gulp-serve');

gulp.task('clean', function() {
    gulp.src('dist/**/*')
    	.pipe(rm());
});

gulp.task('fetch', function() {
	run('ruby generators/discourse.rb', {
		silent : true
	}).exec()
	  .pipe(rename("latest.json"))
	  .pipe(gulp.dest('./dist'));
});

gulp.task('render', ['fetch'], function() {
	gulp.src("./templates/*.mustache")
    	.pipe(mustache("./dist/latest.json"))
    	.pipe(ext_replace('.html'))
    	.pipe(gulp.dest("./dist/public"));	
})

gulp.task('less', function() {
	return gulp.src('./less/**/*.less')
	    .pipe(less({
		    paths : [ path.join(__dirname, 'less', 'includes') ]
	    }))
	    .pipe(gulp.dest('./dist/public/css'));
});

gulp.task('serve', serve('./dist/public'));