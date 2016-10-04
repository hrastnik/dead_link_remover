var rawjs = require('raw.js');
var reddit = new rawjs('dead-link-remover');
var fs = require('fs');
var readline = require('readline');
var http = require('https');

var settings = JSON.parse(fs.readFileSync(`${__dirname}/settings.json`));

if (settings.reddit_secret == null ||
    settings.reddit_client_id == null ||
    settings.reddit_username == null ||
    settings.reddit_subreddit == null)
{
    throw 'Invalid settings detected';
}

var reddit_secret = settings.reddit_secret;
var reddit_client_id = settings.reddit_client_id;
var reddit_username = settings.reddit_username
var reddit_subreddit = settings.reddit_subreddit
var remove_interval = settings.remove_interval || (600000);
var reddit_redirect_uri = 'http://www.google.com/';
var reddit_password;

var rl = readline.createInterface({
    input : process.stdin,
    output : process.stdout
});

// Ask user for password
rl.question('Enter reddit password:', function (user_input)
{
    console.log('\033[2J'); // Clear screen to hide password

    reddit_password = user_input;
    reddit.setupOAuth2(reddit_client_id, reddit_secret, reddit_redirect_uri);
    
    reddit_login(
        () => console.log('Logged in reddit account successfully'),
        (err) => {console.error('Error logging in reddit account..\n' + err); process.exit(-1);});
   
    setInterval(main_loop, remove_interval);

    console.log('Dead link remover successfully started');
});


/*
    Check if youtube video with given id is removed. 
    Calls on_removed if video removed, else calls on_valid.
*/
function check_if_youtube_video_removed(youtube_video_id, on_valid, on_removed)
{
    var request = http.request(
        {
            host: 'www.youtube.com',
            path: '/watch?v=' + youtube_video_id
        },
        function (response)
        {
            var is_removed = false;
            var page = '';
            
            function has_default_youtube_title(str)
            {
                return str.indexOf('<title>YouTube</title>') !== -1;
            }

            response.on('data', (chunk) => page += chunk);
        
            response.on('end', () => has_default_youtube_title(page) ? on_removed() : on_valid());
        }
    );

    request.on('error', error => console.error('Youtube request failed:\n' + error));

    request.end();
}

/*
    Gets latest posts from reddit 
    Callback parameter is reddit listing object with posts in object.data.children array  
*/
function get_latest_posts(subreddit_name, received_posts_callback)
{
    var request = http.request(
        {
            host : 'www.reddit.com',
            path : '/r/' + subreddit_name + '/new.json',
            method : 'GET'
        },
        function (response)
        {
            var page_string = ''; 
            response.on('data', chunk => page_string += chunk);
            response.on('end', () => 
            {
                try
                {    
                    received_posts_callback(JSON.parse(page_string));
                }
                catch (e)
                {
                    return {};
                }
            });
        }
    );

    request.on('error', error => console.error('Getting reddit posts failed:\n' + error));

    request.end();
}

/*
    Log in to reddit and calls on_login_success with parameter returned by reddit
*/
function reddit_login(on_login_success, on_login_fail)
{
    reddit.auth(
        {
            'username' : reddit_username,
            'password' : reddit_password
        }, 
        function (err, res)
        {
            if (err) 
            {
                if (on_login_fail)
                {
                    on_login_fail(err);
                }
                else 
                {
                    console.error('Error' + err);
                }
            }
            else on_login_success();
        }
    );
}

function remove_reddit_post(post_id)
{
    reddit.remove(post_id, (err) => err && console.error('Error from remove('+post_id+'): ' + err));
}

function check_if_post_is_youtube_link(post, on_true)
{
    if (post.data.domain === 'youtu.be')
    {
        var tmp = post.data.url.split('youtu.be/');
        var video_id = tmp[tmp.length - 1].substr(0, 11);
        on_true(video_id);
    }
    else if (post.data.domain === 'youtube.com')
    {
        var tmp = post.data.url.split('watch?v=');
        var video_id = tmp[tmp.length - 1].substr(0, 11);
        on_true(video_id);
    }
}

function main_loop()
{
    console.log('Getting latest posts');
    get_latest_posts(reddit_subreddit, function(json_posts)
    {
        if (json_posts.kind != 'Listing')
        {
            console.error("Error getting Reddit posts");
            return;
        }

        reddit_login(() => 
        {
            json_posts.data.children.forEach((post) =>
            {
                if (post.kind !== 't3')
                {
                    console.log('Reddit post with id ' + post.data.id + ' is not a link'); 
                    return;
                }
            
                check_if_post_is_youtube_link(post, function on_true(video_id) 
                {
                    check_if_youtube_video_removed(
                        video_id, 
                        function on_not_removed() 
                        {
                            console.log('Post ' + post.data.id + ' : Youtube ID '+ video_id +' is not removed.')
                        },
                        function on_removed()
                        {
                            console.log('Trying to remove post ' + post.data.id + ' with Youtube ID ' + video_id)
                            remove_reddit_post(post.data.name);
                        }
                    );
                });
            });
        });
    });    
}
