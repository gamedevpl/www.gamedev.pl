// main tasks
var gulp = require('gulp');
var serve = require('gulp-serve');
var ghPages = require('gulp-gh-pages');
var runSequence = require('run-sequence');
var watch = require('gulp-watch');
var shell = require('gulp-shell').task;

gulp.task('serve', ['build', 'watch'], serve('./dist/public'));

gulp.task('clean', function() {
    return gulp.src('dist/**/*')
        .pipe(rm());
});

gulp.task('build', function(done) {
    runSequence('fetch', ['less', 'render', 'assets', 'CNAME'], done);
});

gulp.task('watch', function() {
    watch('app/**/*', function() { 
        runSequence('render'); 
    });
});

gulp.task('deploy', ['build'], function() {
    return gulp.src('./dist/public/**/*')
        .pipe(ghPages({
            remoteUrl: "git@github.com:gamedevpl/www.gamedev.pl.git"
        }));
});

gulp.task('travis-prepare', function(done) {
    if (process.env.TRAVIS_PULL_REQUEST === "false") {
        runSequence("travis-decrypt", "travis-ssh-add", "travis-gitconfig", done);
    } else {
        console.log("Pull request, skipping.")
        done();
    }
});        
gulp.task('travis-decrypt', shell([
    'openssl aes-256-cbc -K $encrypted_6d68858b518f_key -iv $encrypted_6d68858b518f_iv -in .travisdeploykey.enc -out .travisdeploykey -d',     
    'chmod go-rwx .travisdeploykey'
]));
gulp.task('travis-ssh-add', shell('ssh-add .travisdeploykey'));        
gulp.task('travis-gitconfig', shell([     
    'git config --global user.email "gamedevpl@travis-ci.org"',
    'git config --global user.name "Travis-CI"'
]));

// sub tasks
var concat = require('gulp-concat');
var download = require("gulp-download");
var ext_replace = require('gulp-ext-replace');
var jsoncombine = require("gulp-jsoncombine");
var mustache = require("gulp-mustache");
var less = require('gulp-less');
var path = require('path');
var rename = require("gulp-rename");
var rm = require('gulp-rm')

gulp.task('fetch_topics', function() {
    return download("https://forum.gamedev.pl/latest.json")
      .pipe(rename("topics.json"))
      .pipe(gulp.dest('./dist'));
});

gulp.task('fetch_highlights', function() {
    return gulp.src("highlights/*.json")
        .pipe(jsoncombine("highlights.json", function(data) {
            return new Buffer(JSON.stringify(data));
         }))
        .pipe(gulp.dest('./dist'));
});

gulp.task('fetch_jobs', function() {

});

gulp.task('fetch', ['fetch_topics', 'fetch_highlights', 'fetch_jobs'], function() {
    return gulp.src(['dist/topics.json', 
              'dist/jobs.json', 
              'dist/highlights.json'])
         .pipe(jsoncombine("combined.json", function(data) {
             return new Buffer(JSON.stringify(data))
          }))
         .pipe(gulp.dest('./dist'));
});

gulp.task('render', function() {
    return gulp.src("app/templates/**/*.mustache")
        .pipe(mustache("./dist/combined.json"))
        .pipe(ext_replace('.html'))
        .pipe(gulp.dest("./dist/public"));    
});

gulp.task('less', function() {
    return gulp.src('app/less/**/*.less')
        .pipe(less({
            paths : [ path.join(__dirname, 'less', 'includes') ]
        }))
        .pipe(gulp.dest('./dist/public/css'));
});

gulp.task('assets', function() {
    return gulp.src('app/assets/**/*')
        .pipe(gulp.dest('./dist/public/assets'));
});

gulp.task('CNAME', function() {
    return gulp.src('CNAME')
        .pipe(gulp.dest('./dist/public'));
});
